import { createHash, randomUUID } from 'node:crypto';

interface TokenResponse {
  data?: {
    accessToken?: string;
  };
}

interface SendEmailInput {
  recipient: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
}

const CHATSEND_TIMEOUT_MS = 10_000;

function config() {
  const configuredBaseUrl = process.env.CHATSEND_BASE_URL?.replace(/\/+$/, '');
  const apiKey = process.env.CHATSEND_API_KEY;
  if (!configuredBaseUrl || !apiKey) {
    throw new Error('ChatSend no está configurado');
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error('CHATSEND_BASE_URL no es una URL válida');
  }

  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('CHATSEND_BASE_URL debe usar HTTP o HTTPS');
  }
  if (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:') {
    throw new Error('CHATSEND_BASE_URL debe usar HTTPS en producción');
  }

  return { baseUrl: configuredBaseUrl, apiKey };
}

async function accessToken(): Promise<string> {
  const { baseUrl, apiKey } = config();
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grantType: 'apiKey', apiKey }),
    cache: 'no-store',
    signal: AbortSignal.timeout(CHATSEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`ChatSend rechazó la autenticación (${response.status})`);
  }

  let payload: TokenResponse;
  try {
    payload = (await response.json()) as TokenResponse;
  } catch {
    throw new Error(
      'ChatSend devolvió una respuesta de autenticación inválida'
    );
  }
  const token = payload.data?.accessToken;
  if (!token) throw new Error('ChatSend no devolvió un access token');
  return token;
}

function stableKey(input: SendEmailInput): string {
  if (input.idempotencyKey) return input.idempotencyKey;
  const digest = createHash('sha256')
    .update(`${input.recipient}\0${input.subject}\0${input.text}`)
    .digest('hex')
    .slice(0, 32);
  return `crm-${digest}-${randomUUID()}`;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { baseUrl } = config();
  const token = await accessToken();
  const response = await fetch(`${baseUrl}/api/v1/client/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': stableKey(input),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: input.recipient,
      content: {
        mode: 'direct',
        subject: input.subject,
        text: input.text,
        html: input.html,
      },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(CHATSEND_TIMEOUT_MS),
  });

  if (response.status !== 202) {
    throw new Error(`ChatSend no pudo encolar el correo (${response.status})`);
  }
}
