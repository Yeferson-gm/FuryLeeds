import { describe, expect, it } from 'bun:test';
import {
  SendMessageError,
  validateSendMessageParams,
} from '@/lib/api/v1/messages';

describe('validateSendMessageParams', () => {
  it('accepts valid text and media payloads', () => {
    expect(() =>
      validateSendMessageParams({ messageType: 'text', contentText: 'Hola' })
    ).not.toThrow();
    expect(() =>
      validateSendMessageParams({
        messageType: 'document',
        mediaUrl: 'https://cdn.example.com/file.pdf',
      })
    ).not.toThrow();
  });

  it('preserves public validation errors', () => {
    expect(() =>
      validateSendMessageParams({ messageType: 'text', contentText: '' })
    ).toThrow(SendMessageError);
    try {
      validateSendMessageParams({ messageType: 'unknown' });
    } catch (error) {
      expect(error).toMatchObject({ code: 'bad_request', status: 400 });
    }
  });

  it('rejects invalid interactive payloads before any DB or Meta call', () => {
    expect(() =>
      validateSendMessageParams({
        messageType: 'interactive',
        interactivePayload: null,
      })
    ).toThrow(/payload is required/i);
  });
});
