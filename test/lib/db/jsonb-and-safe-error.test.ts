import { describe, expect, it } from 'bun:test';
import { decodeJsonbValue } from '@/lib/db/jsonb';
import { safeDatabaseError } from '@/lib/db/safe-error';

describe('decodeJsonbValue', () => {
  it('preserves native JSON values', () => {
    const value = [{ type: 'QUICK_REPLY', text: 'Continuar' }];
    expect(
      decodeJsonbValue<Array<{ type: string; text: string }>>(value)
    ).toEqual(value);
  });

  it('decodes legacy JSONB strings', () => {
    expect(
      decodeJsonbValue<Array<{ type: string; text: string }>>(
        `[{"type":"QUICK_REPLY","text":"Continuar"}]`
      )
    ).toEqual([{ type: 'QUICK_REPLY', text: 'Continuar' }]);
  });

  it('returns null for malformed legacy strings', () => {
    expect(decodeJsonbValue('not-json')).toBeNull();
  });
});

describe('safeDatabaseError', () => {
  it('keeps only safe database metadata from the nested cause', () => {
    const error = Object.assign(new Error('Failed query with private params'), {
      query: 'insert into message_templates ...',
      params: ['Customer Name', 'https://private.example/document.pdf'],
      cause: {
        code: 'ERR_POSTGRES_SERVER_ERROR',
        errno: '23514',
        constraint: 'message_templates_buttons_shape_check',
        detail: 'Failing row contains private data',
      },
    });

    expect(safeDatabaseError(error)).toEqual({
      kind: 'database_error',
      code: 'ERR_POSTGRES_SERVER_ERROR',
      constraint: 'message_templates_buttons_shape_check',
    });
  });
});
