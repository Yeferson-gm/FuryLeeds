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

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY is not configured.');
  }
  return key;
}

// 12 bytes is the NIST-recommended IV length for GCM — keeps the
// counter block well below 2^32 and matches the default web-crypto
// behaviour, so any future port is straightforward.
const GCM_IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(getEncryptionKey(), 'hex'),
    iv
  );
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
    Buffer.from(getEncryptionKey(), 'hex'),
    iv
  );
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
