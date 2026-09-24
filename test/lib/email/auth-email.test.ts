import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  sendPasswordChangedEmail,
  sendPasswordResetCode,
  sendVerificationEmail,
  sendWelcomeEmail,
} from '@/lib/email/auth-email';

const originalFetch = globalThis.fetch;
let deliveries: Array<{ headers: Headers; body: Record<string, unknown> }>;

beforeEach(() => {
  process.env.CHATSEND_BASE_URL = 'https://api.chatsend.test';
  process.env.CHATSEND_API_KEY = 'test-api-key';
  deliveries = [];
  globalThis.fetch = mock(async (input, init) => {
    if (String(input).endsWith('/oauth/token')) {
      return Response.json({ data: { accessToken: 'access-token' } });
    }
    deliveries.push({
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.CHATSEND_BASE_URL;
  delete process.env.CHATSEND_API_KEY;
});

function deliveredContent(): Record<string, string> {
  const content = deliveries[0]?.body.content;
  if (!content || typeof content !== 'object') {
    throw new Error('Expected ChatSend content');
  }
  return content as Record<string, string>;
}

describe('authentication email content', () => {
  it('sends escaped verification copy and a deterministic token key', async () => {
    await sendVerificationEmail({
      email: 'owner@example.test',
      name: '<Propietario>',
      url: 'https://crm.test/api/auth/verify-email?token=a&next=/dashboard',
      token: 'verification-token',
    });

    const content = deliveredContent();
    expect(content.subject).toBe('Confirma tu correo electrónico');
    expect(content.html).toContain('Hola &lt;Propietario&gt;');
    expect(content.html).not.toContain('Hola <Propietario>');
    expect(content.html).toContain('token=a&amp;next=/dashboard');
    expect(deliveries[0]?.headers.get('Idempotency-Key')).toBe(
      'verify-verification-token'
    );
  });

  it('sends the six-digit reset code without exposing it in the idempotency key', async () => {
    await sendPasswordResetCode({
      email: 'owner@example.test',
      otp: '123456',
    });

    const content = deliveredContent();
    expect(content.subject).toBe('Tu código para restablecer la contraseña');
    expect(content.text).toContain('123456');
    expect(content.html).toContain('123456');
    expect(content.html).toContain('caduca en 10 minutos');
    const idempotencyKey = deliveries[0]?.headers.get('Idempotency-Key');
    expect(idempotencyKey).toStartWith('reset-otp-');
    expect(idempotencyKey).not.toContain('123456');
    expect(idempotencyKey).not.toContain('owner@example.test');
  });

  it('welcomes a verified user with business-oriented FuryLeeds copy', async () => {
    await sendWelcomeEmail({
      email: 'owner@example.test',
      name: 'María',
      userId: 'user-123',
    });

    const content = deliveredContent();
    expect(content.subject).toBe('Te damos la bienvenida a FuryLeeds');
    expect(content.text).toContain('haz crecer tu negocio');
    expect(content.html).toContain('¡Bienvenido a FuryLeeds, María!');
    expect(deliveries[0]?.headers.get('Idempotency-Key')).toBe(
      'welcome-user-123'
    );
  });

  it('confirms that the recovered password can be used to sign in', async () => {
    await sendPasswordChangedEmail({
      email: 'owner@example.test',
      name: 'María',
    });

    const content = deliveredContent();
    expect(content.subject).toBe('Tu contraseña se actualizó correctamente');
    expect(content.html).toContain('Contraseña recuperada correctamente');
    expect(content.text).toContain(
      'Ya puedes iniciar sesión con tu nueva contraseña'
    );
  });
});
