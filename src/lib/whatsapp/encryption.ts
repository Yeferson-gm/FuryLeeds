import crypto from 'node:crypto';

/**
 * WhatsApp token encryption.
 *
 * Format:
 *   `<iv-hex>:<ciphertext-hex>:<authTag-hex>`
 *
 * AES-256-GCM authenticates the ciphertext as well as encrypting it. Any
 * modification to the IV, ciphertext, or authentication tag makes decryption
 * fail instead of returning corrupted credential data.
 */

export class EncryptionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionConfigurationError';
  }
}

function normalizedEncryptionKeyHex(): string {
  const configured = process.env.ENCRYPTION_KEY;
  if (!configured?.trim()) {
    throw new EncryptionConfigurationError('ENCRYPTION_KEY is not configured.');
  }

  const trimmed = configured.trim();
  const quote = trimmed[0];
  const key =
    trimmed.length >= 2 &&
    (quote === '"' || quote === "'") &&
    trimmed.at(-1) === quote
      ? trimmed.slice(1, -1)
      : trimmed;

  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new EncryptionConfigurationError(
      'ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.'
    );
  }

  return key.toLowerCase();
}

function getEncryptionKey(): Buffer {
  const key = Buffer.from(normalizedEncryptionKeyHex(), 'hex');
  if (key.length !== 32) {
    throw new EncryptionConfigurationError(
      'ENCRYPTION_KEY must decode to exactly 32 bytes.'
    );
  }
  return key;
}

export function assertEncryptionConfigured(): void {
  getEncryptionKey();
}

export function isEncryptionKeyValue(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value.trim())) {
    return false;
  }

  const candidate = Buffer.from(value.trim(), 'hex');
  const configured = getEncryptionKey();
  return crypto.timingSafeEqual(candidate, configured);
}

// 12 bytes is the NIST-recommended IV length for GCM — keeps the
// counter block well below 2^32 and matches the default web-crypto
// behaviour, so any future port is straightforward.
const GCM_IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');

  if (parts.length !== 3) {
    throw new Error(
      `Encrypted token has unrecognised format (expected 2 colons, got ${
        parts.length - 1
      })`
    );
  }

  const [ivHex, ciphertextHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  if (iv.length !== GCM_IV_LENGTH) {
    throw new Error(
      `Encrypted token has unexpected GCM IV length ${iv.length}`
    );
  }
  const authTag = Buffer.from(tagHex, 'hex');
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Encrypted token has unexpected GCM auth-tag length ${authTag.length}`
    );
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    iv
  );
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
