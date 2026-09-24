import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  mock,
  spyOn,
} from 'bun:test';
import { MEDIA_MAX_BYTES_BY_KIND } from '@/lib/storage/upload-media';
import {
  mirrorFileName,
  mirrorInboundMedia,
  normalizeMimeType,
} from '@/lib/whatsapp/mirror-inbound-media';

const ACCOUNT = '11111111-2222-3333-4444-555555555555';
const MEDIA_ID = '1234567890123456';
const originalFetch = globalThis.fetch;

function fakeDownload(bytes: number, contentType = 'image/jpeg') {
  return mock(async () => ({
    buffer: Buffer.alloc(bytes),
    contentType,
  }));
}

function mockImgoraUpload(secureUrl = 'https://cdn.imgora.test/media.jpg') {
  const provider = mock(async (_input: unknown, _init?: RequestInit) =>
    Response.json({
      data: { public_id: 'tenant/inbound/media', secure_url: secureUrl },
    })
  );
  globalThis.fetch = provider as unknown as typeof fetch;
  return provider;
}

const BASE = {
  accountId: ACCOUNT,
  mediaId: MEDIA_ID,
  downloadUrl: 'https://lookaside.example/whatsapp/abc',
  accessToken: 'test-token',
} as const;

beforeEach(() => {
  process.env.IMGORA_API_URL = 'https://api.imgora.test';
  process.env.IMGORA_API_KEY = 'imgora-secret';
  process.env.IMGORA_ORIGIN = 'https://crm.test';
  process.env.IMGORA_BASE_FOLDER = 'furyleeds';
  process.env.ENCRYPTION_KEY = 'test-signing-key';
  spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete process.env.IMGORA_API_URL;
  delete process.env.IMGORA_API_KEY;
  delete process.env.IMGORA_ORIGIN;
  delete process.env.IMGORA_BASE_FOLDER;
  delete process.env.ENCRYPTION_KEY;
});

describe('normalizeMimeType', () => {
  it('strips parameters and lower-cases', () => {
    expect(normalizeMimeType('audio/ogg; codecs=opus')).toBe('audio/ogg');
    expect(normalizeMimeType('IMAGE/JPEG')).toBe('image/jpeg');
  });

  it('rejects unusable values', () => {
    expect(normalizeMimeType(null)).toBeNull();
    expect(normalizeMimeType('binary')).toBeNull();
  });
});

describe('mirrorFileName', () => {
  it('keeps a safe document name and derives its extension from MIME', () => {
    expect(
      mirrorFileName({
        mediaId: MEDIA_ID,
        mimeType: 'application/pdf',
        fileName: '../../payload.exe',
      })
    ).toBe(`${MEDIA_ID}-payload.pdf`);
  });

  it('synthesizes a deterministic stamped image name', () => {
    expect(
      mirrorFileName({
        mediaId: MEDIA_ID,
        mimeType: 'image/jpeg',
        messageTimestamp: '1754899200',
      })
    ).toBe(`${MEDIA_ID}-image-1754899200.jpg`);
  });
});

describe('mirrorInboundMedia', () => {
  it('uploads to Imgora and returns secure_url directly', async () => {
    const provider = mockImgoraUpload();
    const url = await mirrorInboundMedia({
      ...BASE,

      mimeType: 'image/jpeg',
      fileSize: 3,
      messageTimestamp: '1754899200',
      download: mock(async () => ({
        buffer: Buffer.from([1, 2, 3]),
        contentType: 'image/jpeg',
      })),
    });

    expect(url).toBe('https://cdn.imgora.test/media.jpg');
    expect(provider).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = provider.mock.calls[0];
    expect(String(requestUrl)).toBe('https://api.imgora.test/image/pro/upload');
    expect(init).toBeDefined();
    const form = init?.body as FormData;
    expect(form.get('folder')).toBe(
      `furyleeds/chat-media/account-${ACCOUNT}/inbound`
    );
    expect(form.get('filename')).toBe(`${MEDIA_ID}-image-1754899200.jpg`);
  });

  it('uses the same deterministic Imgora filename on redelivery', async () => {
    const provider = mockImgoraUpload();
    const args = {
      ...BASE,
      mimeType: 'image/png',
      messageTimestamp: '1754899200',
    };
    await mirrorInboundMedia({
      ...args,
      download: fakeDownload(1, 'image/png'),
    });
    await mirrorInboundMedia({
      ...args,
      download: fakeDownload(1, 'image/png'),
    });

    expect(provider).toHaveBeenCalledTimes(2);
    const filenames = provider.mock.calls.map((call) => {
      const init = call[1] as RequestInit;
      return (init.body as FormData).get('filename');
    });
    expect(filenames).toEqual([
      `${MEDIA_ID}-image-1754899200.png`,
      `${MEDIA_ID}-image-1754899200.png`,
    ]);
  });

  it('skips oversized images before downloading', async () => {
    const provider = mockImgoraUpload();
    const download = fakeDownload(1);
    const result = await mirrorInboundMedia({
      ...BASE,
      mimeType: 'image/jpeg',
      fileSize: MEDIA_MAX_BYTES_BY_KIND.image + 1,
      download,
    });

    expect(result).toBeNull();
    expect(download).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('rejects an unsupported MIME type without throwing', async () => {
    const provider = mockImgoraUpload();
    const result = await mirrorInboundMedia({
      ...BASE,
      mimeType: 'application/x-executable',
      download: fakeDownload(10, 'application/x-executable'),
    });
    expect(result).toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });

  it('returns null when the download fails', async () => {
    const result = await mirrorInboundMedia({
      ...BASE,
      mimeType: 'image/png',
      download: mock(async () => {
        throw new Error('download failed');
      }),
    });
    expect(result).toBeNull();
  });
});
