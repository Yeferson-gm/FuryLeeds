import { describe, expect, it } from 'bun:test';
import {
  assertEncryptionConfigured,
  decrypt,
  encrypt,
  isEncryptionKeyValue,
} from '@/lib/whatsapp/encryption';

const TEST_KEY = 'ab'.repeat(32);

function withEncryptionKey<T>(value: string, callback: () => T): T {
  const previous = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = value;
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previous;
  }
}

describe('encryption', () => {
  describe('encrypt / decrypt round-trip', () => {
    it('recovers the original plaintext', () => {
      const ct = encrypt('EAAG... fake WhatsApp token');
      expect(decrypt(ct)).toBe('EAAG... fake WhatsApp token');
    });

    it('produces three colon-separated parts (GCM)', () => {
      const ct = encrypt('anything');
      expect(ct.split(':')).toHaveLength(3);
    });

    it('uses a fresh IV per encrypt so identical plaintexts produce different ciphertexts', () => {
      const a = encrypt('same input');
      const b = encrypt('same input');
      expect(a).not.toBe(b);
      expect(decrypt(a)).toBe('same input');
      expect(decrypt(b)).toBe('same input');
    });

    it('roundtrips empty string', () => {
      const ct = encrypt('');
      expect(decrypt(ct)).toBe('');
    });

    it('roundtrips multibyte UTF-8', () => {
      const ct = encrypt('token-✓-🔐-žąsis');
      expect(decrypt(ct)).toBe('token-✓-🔐-žąsis');
    });
  });

  describe('ENCRYPTION_KEY configuration', () => {
    it('accepts exactly 64 hexadecimal characters', () => {
      withEncryptionKey(TEST_KEY, () => {
        expect(() => assertEncryptionConfigured()).not.toThrow();
        expect(decrypt(encrypt('secret'))).toBe('secret');
      });
    });

    it('normalizes deployment whitespace and matching outer quotes', () => {
      for (const configured of [
        `  ${TEST_KEY}\n`,
        `"${TEST_KEY}"`,
        `'${TEST_KEY}'`,
      ]) {
        withEncryptionKey(configured, () => {
          expect(decrypt(encrypt('secret'))).toBe('secret');
        });
      }
    });

    it('rejects incorrect length, non-hex content and variable assignments', () => {
      for (const configured of [
        TEST_KEY.slice(1),
        `${TEST_KEY.slice(0, 63)}z`,
        `ENCRYPTION_KEY=${TEST_KEY}`,
      ]) {
        withEncryptionKey(configured, () => {
          expect(() => assertEncryptionConfigured()).toThrow(
            /exactly 64 hexadecimal/
          );
        });
      }
    });

    it('detects attempts to reuse the master key as another secret', () => {
      withEncryptionKey(TEST_KEY, () => {
        expect(isEncryptionKeyValue(TEST_KEY.toUpperCase())).toBe(true);
        expect(isEncryptionKeyValue('different-webhook-token')).toBe(false);
      });
    });
  });

  describe('GCM authentication', () => {
    it('rejects ciphertext tampered after encryption', () => {
      const ct = encrypt('secret');
      const [ivHex, ctHex, tagHex] = ct.split(':');
      // Flip a byte in the ciphertext body — auth tag will mismatch.
      const tamperedCtHex =
        (parseInt(ctHex.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0') +
        ctHex.slice(2);
      expect(() => decrypt(`${ivHex}:${tamperedCtHex}:${tagHex}`)).toThrow();
    });

    it('rejects a swapped auth tag', () => {
      const ct = encrypt('secret');
      const [ivHex, ctHex] = ct.split(':');
      const bogusTag = '00'.repeat(16);
      expect(() => decrypt(`${ivHex}:${ctHex}:${bogusTag}`)).toThrow();
    });

    it('rejects a GCM IV of the wrong length', () => {
      const ct = encrypt('secret');
      const [, ctHex, tagHex] = ct.split(':');
      const shortIv = '00'.repeat(8); // 8 bytes ≠ 12
      expect(() => decrypt(`${shortIv}:${ctHex}:${tagHex}`)).toThrow(
        /GCM IV length/
      );
    });

    it('rejects a GCM auth tag of the wrong length', () => {
      const ct = encrypt('secret');
      const [ivHex, ctHex] = ct.split(':');
      const shortTag = '00'.repeat(8); // 8 bytes ≠ 16
      expect(() => decrypt(`${ivHex}:${ctHex}:${shortTag}`)).toThrow(
        /auth-tag length/
      );
    });
  });

  describe('malformed input', () => {
    it('throws on a single-token blob (no colons)', () => {
      expect(() => decrypt('not-encrypted-at-all')).toThrow(
        /unrecognised format/
      );
    });

    it('throws on a two-part blob', () => {
      expect(() => decrypt('aa:bb')).toThrow(/unrecognised format/);
    });

    it('throws on a four-part blob', () => {
      expect(() => decrypt('aa:bb:cc:dd')).toThrow(/unrecognised format/);
    });
  });
});
