import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { sendEmail } from '@/lib/email/chatsend';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CHATSEND_BASE_URL = 'https://api.chatsend.test/';
  process.env.CHATSEND_API_KEY = 'test-api-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.CHATSEND_BASE_URL;
  delete process.env.CHATSEND_API_KEY;
});

describe('ChatSend email adapter', () => {
  it('exchanges the API key and enqueues direct email with a stable key', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock(async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return Response.json({ data: { accessToken: 'access-token' } });
      }
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    await sendEmail({
      recipient: 'person@example.test',
      subject: 'Asunto',
      text: 'Contenido',
      html: '<p>Contenido</p>',
      idempotencyKey: 'event-123',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe('https://api.chatsend.test/oauth/token');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      grantType: 'apiKey',
      apiKey: 'test-api-key',
    });
    expect(calls[1]?.url).toBe(
      'https://api.chatsend.test/api/v1/client/emails'
    );
    const headers = new Headers(calls[1]?.init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('Idempotency-Key')).toBe('event-123');
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      recipient: 'person@example.test',
      content: {
        mode: 'direct',
        subject: 'Asunto',
        text: 'Contenido',
        html: '<p>Contenido</p>',
      },
    });
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[1]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects malformed authentication JSON without attempting delivery', async () => {
    const provider = mock(
      async () =>
        new Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    globalThis.fetch = provider as unknown as typeof fetch;

    await expect(
      sendEmail({
        recipient: 'person@example.test',
        subject: 'Asunto',
        text: 'Contenido',
        html: '<p>Contenido</p>',
      })
    ).rejects.toThrow('respuesta de autenticación inválida');
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('requires ChatSend to acknowledge the enqueue with HTTP 202', async () => {
    globalThis.fetch = mock(async (input) => {
      if (String(input).endsWith('/oauth/token')) {
        return Response.json({ data: { accessToken: 'access-token' } });
      }
      return Response.json({ error: 'unavailable' }, { status: 503 });
    }) as unknown as typeof fetch;

    await expect(
      sendEmail({
        recipient: 'person@example.test',
        subject: 'Asunto',
        text: 'Contenido',
        html: '<p>Contenido</p>',
      })
    ).rejects.toThrow('no pudo encolar el correo (503)');
  });

  it('rejects unsafe configured URL schemes before sending credentials', async () => {
    process.env.CHATSEND_BASE_URL = 'file:///tmp/chatsend';
    const provider = mock(async () => Response.json({}));
    globalThis.fetch = provider as unknown as typeof fetch;

    await expect(
      sendEmail({
        recipient: 'person@example.test',
        subject: 'Asunto',
        text: 'Contenido',
        html: '<p>Contenido</p>',
      })
    ).rejects.toThrow('debe usar HTTP o HTTPS');
    expect(provider).not.toHaveBeenCalled();
  });
});
