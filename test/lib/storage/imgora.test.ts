import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  createAssetReference,
  deleteAccountFile,
  getAccountFile,
  readAssetReference,
  resourceTypeForMime,
  uploadAccountFile,
} from '@/lib/storage/imgora';

const ACCOUNT = '11111111-2222-3333-4444-555555555555';
const OTHER_ACCOUNT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.IMGORA_API_URL = 'https://api.imgora.test/';
  process.env.IMGORA_API_KEY = 'imgora-secret';
  process.env.IMGORA_ORIGIN = 'https://crm.test';
  process.env.IMGORA_BASE_FOLDER = '/furyleeds/';
  process.env.ENCRYPTION_KEY = 'test-signing-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.IMGORA_API_URL;
  delete process.env.IMGORA_API_KEY;
  delete process.env.IMGORA_ORIGIN;
  delete process.env.IMGORA_BASE_FOLDER;
  delete process.env.ENCRYPTION_KEY;
});

describe('Imgora account storage', () => {
  it('uploads to the MIME-specific Pro endpoint with server credentials', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = mock(async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return Response.json({
        data: {
          public_id: 'furyleeds/chat-media/account-id/invoice',
          secure_url: 'https://cdn.imgora.test/invoice.pdf',
        },
      });
    }) as unknown as typeof fetch;

    const result = await uploadAccountFile({
      collection: 'chat-media',
      accountId: ACCOUNT,
      fileName: '../../Invoice.EXE',
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'application/pdf',
      now: 1700000000000,
    });

    expect(capturedUrl).toBe('https://api.imgora.test/file/pro/upload');
    expect(capturedInit?.method).toBe('POST');
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer imgora-secret');
    expect(headers.get('X-Imgora-Origin')).toBe('https://crm.test');
    expect(headers.has('Content-Type')).toBe(false);

    const form = capturedInit?.body as FormData;
    expect(form.get('folder')).toBe(`furyleeds/chat-media/account-${ACCOUNT}`);
    expect(form.get('filename')).toBe('1700000000000-Invoice.pdf');
    expect((form.get('file') as File).name).toBe('1700000000000-Invoice.pdf');
    expect(result.publicUrl).toBe('https://cdn.imgora.test/invoice.pdf');
    expect(result.path).not.toContain(ACCOUNT);
    expect(result.path).not.toContain('invoice');
    expect(
      readAssetReference(result.path, {
        collection: 'chat-media',
        accountId: ACCOUNT,
      }).publicId
    ).toBe('furyleeds/chat-media/account-id/invoice');
  });

  it('selects all four Pro upload families from MIME', () => {
    expect(resourceTypeForMime('image/jpeg')).toBe('image');
    expect(resourceTypeForMime('video/mp4')).toBe('video');
    expect(resourceTypeForMime('audio/ogg')).toBe('audio');
    expect(resourceTypeForMime('application/pdf')).toBe('file');
  });

  it('rejects unsupported MIME types and avatar overages before fetch', async () => {
    const provider = mock(async () => Response.json({}));
    globalThis.fetch = provider as unknown as typeof fetch;

    await expect(
      uploadAccountFile({
        collection: 'chat-media',
        accountId: ACCOUNT,
        fileName: 'payload.svg',
        bytes: new Uint8Array([1]),
        mimeType: 'image/svg+xml',
      })
    ).rejects.toThrow('Unsupported file type.');

    await expect(
      uploadAccountFile({
        collection: 'avatars',
        accountId: ACCOUNT,
        fileName: 'avatar.png',
        bytes: new Uint8Array(2 * 1024 * 1024 + 1),
        mimeType: 'image/png',
      })
    ).rejects.toThrow('File exceeds');
    expect(provider).not.toHaveBeenCalled();
  });

  it('rejects tampered and cross-account asset references', () => {
    const reference = createAssetReference({
      accountId: ACCOUNT,
      collection: 'avatars',
      publicId: 'tenant-a/avatar',
      type: 'image',
    });

    expect(() =>
      readAssetReference(`${reference}x`, {
        collection: 'avatars',
        accountId: ACCOUNT,
      })
    ).toThrow('File not found.');
    expect(() =>
      readAssetReference(reference, {
        collection: 'avatars',
        accountId: OTHER_ACCOUNT,
      })
    ).toThrow('File not found.');
    expect(() =>
      readAssetReference(reference, {
        collection: 'chat-media',
        accountId: ACCOUNT,
      })
    ).toThrow('File not found.');
  });

  it('gets and deletes only the public_id signed into the reference', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = mock(async (input, init) => {
      calls.push({ url: String(input), init });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({
        data: {
          public_id: 'tenant/account/photo id',
          secure_url: 'https://cdn.imgora.test/photo.jpg',
        },
      });
    }) as unknown as typeof fetch;
    const reference = createAssetReference({
      accountId: ACCOUNT,
      collection: 'chat-media',
      publicId: 'tenant/account/photo id',
      type: 'image',
    });

    const asset = await getAccountFile('chat-media', ACCOUNT, reference);
    await deleteAccountFile('chat-media', ACCOUNT, reference);

    expect(asset.secureUrl).toBe('https://cdn.imgora.test/photo.jpg');
    expect(calls[0].url).toBe(
      'https://api.imgora.test/resources/tenant%2Faccount%2Fphoto%20id?type=image'
    );
    expect(calls[1].url).toBe(
      'https://api.imgora.test/assets/tenant%2Faccount%2Fphoto%20id'
    );
    expect(calls[1].init?.method).toBe('DELETE');
  });

  it('rejects an unsafe configured base folder before uploading', async () => {
    process.env.IMGORA_BASE_FOLDER = '../shared';
    const provider = mock(async () => Response.json({}));
    globalThis.fetch = provider as unknown as typeof fetch;

    await expect(
      uploadAccountFile({
        collection: 'chat-media',
        accountId: ACCOUNT,
        fileName: 'photo.jpg',
        bytes: new Uint8Array([1]),
        mimeType: 'image/jpeg',
      })
    ).rejects.toThrow('IMGORA_BASE_FOLDER is invalid.');
    expect(provider).not.toHaveBeenCalled();
  });

  it('rejects an unsafe CDN URL returned by Imgora', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        data: {
          public_id: 'asset-1',
          secure_url: 'javascript:alert(1)',
        },
      })
    ) as unknown as typeof fetch;

    await expect(
      uploadAccountFile({
        collection: 'avatars',
        accountId: ACCOUNT,
        fileName: 'photo.jpg',
        bytes: new Uint8Array([1]),
        mimeType: 'image/jpeg',
      })
    ).rejects.toThrow('Imgora returned an invalid response.');
  });

  it('maps provider network failures to a storage gateway error', async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError('connection refused');
    }) as unknown as typeof fetch;

    await expect(
      uploadAccountFile({
        collection: 'avatars',
        accountId: ACCOUNT,
        fileName: 'photo.jpg',
        bytes: new Uint8Array([1]),
        mimeType: 'image/jpeg',
      })
    ).rejects.toMatchObject({
      message: 'Imgora is unavailable.',
      status: 502,
    });
  });
});
