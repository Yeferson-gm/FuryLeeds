import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { schema } from '@/lib/db';
import type { WhatsAppQueryDb } from '@/lib/whatsapp/db';
import {
  handleTemplateWebhookChange,
  isTemplateWebhookField,
} from '@/lib/whatsapp/template-webhook';

type TableName = 'messageTemplates' | 'whatsappConfig';
type Rows = { id: string }[];

interface DbCall {
  table: TableName;
  update?: Record<string, unknown>;
  filter?: { column: string; value: unknown };
  insert?: Record<string, unknown>;
  select?: string[];
}

function tableName(table: unknown): TableName {
  if (table === schema.messageTemplates) return 'messageTemplates';
  if (table === schema.whatsappConfig) return 'whatsappConfig';
  throw new Error('Unexpected table in template webhook Drizzle mock');
}

function readFilter(condition: unknown): DbCall['filter'] {
  const chunks = (condition as { queryChunks?: unknown[] }).queryChunks ?? [];
  const column = chunks.find(
    (chunk): chunk is { name: string } =>
      typeof chunk === 'object' &&
      chunk !== null &&
      typeof (chunk as { name?: unknown }).name === 'string'
  );
  const param = chunks.find(
    (chunk): chunk is { value: unknown } =>
      typeof chunk === 'object' &&
      chunk !== null &&
      chunk.constructor.name === 'Param'
  );
  if (!column || !param) throw new Error('Unexpected Drizzle where expression');
  return { column: column.name, value: param.value };
}

function makeDrizzleStub(
  updateRows: Rows = [{ id: 'row-1' }],
  opts: {
    configRows?: { accountId: string; userId: string }[];
    insertError?: unknown;
    retryUpdateRows?: Rows;
  } = {}
) {
  const calls: DbCall[] = [];
  let updateCount = 0;

  const stub = {
    select(fields?: Record<string, unknown>) {
      let entry: DbCall;
      const builder = {
        from(table: unknown) {
          entry = {
            table: tableName(table),
            select: fields ? Object.keys(fields) : [],
          };
          calls.push(entry);
          return builder;
        },
        where(condition: unknown) {
          entry.filter = readFilter(condition);
          return Promise.resolve(opts.configRows ?? []);
        },
      };
      return builder;
    },
    update(table: unknown) {
      const entry: DbCall = { table: tableName(table) };
      calls.push(entry);
      updateCount++;
      const rows =
        updateCount > 1 && opts.retryUpdateRows
          ? opts.retryUpdateRows
          : updateRows;
      const builder = {
        set(fields: Record<string, unknown>) {
          entry.update = fields;
          return builder;
        },
        where(condition: unknown) {
          entry.filter = readFilter(condition);
          return builder;
        },
        returning() {
          return Promise.resolve(rows);
        },
      };
      return builder;
    },
    insert(table: unknown) {
      const entry: DbCall = { table: tableName(table) };
      calls.push(entry);
      return {
        values(fields: Record<string, unknown>) {
          entry.insert = fields;
          if (opts.insertError) throw opts.insertError;
          return Promise.resolve([]);
        },
      };
    },
  };

  return { stub: stub as unknown as WhatsAppQueryDb, calls };
}

describe('isTemplateWebhookField', () => {
  it('recognises the three template fields', () => {
    expect(isTemplateWebhookField('message_template_status_update')).toBe(true);
    expect(isTemplateWebhookField('message_template_quality_update')).toBe(
      true
    );
    expect(isTemplateWebhookField('message_template_components_update')).toBe(
      true
    );
  });
  it('rejects messaging fields', () => {
    expect(isTemplateWebhookField('messages')).toBe(false);
    expect(isTemplateWebhookField('message_status')).toBe(false);
  });
});

describe('handleTemplateWebhookChange — status update', () => {
  let drizzleCalls: ReturnType<typeof makeDrizzleStub>['calls'];

  beforeEach(() => {
    spyOn(console, 'warn').mockImplementation(() => {});
    spyOn(console, 'info').mockImplementation(() => {});
    spyOn(console, 'error').mockImplementation(() => {});
  });

  it('flips status to APPROVED and clears any rejectionReason', async () => {
    const { stub, calls } = makeDrizzleStub();
    drizzleCalls = calls;
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: {
          event: 'APPROVED',
          message_template_id: 12345,
          message_template_name: 'order_confirmation',
          message_template_language: 'en_US',
        },
      },
      stub
    );
    expect(drizzleCalls).toHaveLength(1);
    expect(drizzleCalls[0].table).toBe('messageTemplates');
    expect(drizzleCalls[0].filter).toEqual({
      column: 'meta_template_id',
      value: '12345', // coerced to string for the TEXT column
    });
    expect(drizzleCalls[0].update).toEqual({
      status: 'APPROVED',
      rejectionReason: null,
      submissionError: null,
    });
  });

  it('persists the reason field on REJECTED', async () => {
    const { stub, calls } = makeDrizzleStub();
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: {
          event: 'REJECTED',
          message_template_id: 'TMPL_99',
          reason: 'Template uses non-compliant language.',
        },
      },
      stub
    );
    expect(calls[0].update?.status).toBe('REJECTED');
    expect(calls[0].update?.rejectionReason).toBe(
      'Template uses non-compliant language.'
    );
  });

  it('falls back to a generic reason when REJECTED has no `reason`', async () => {
    const { stub, calls } = makeDrizzleStub();
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: { event: 'REJECTED', message_template_id: '7' },
      },
      stub
    );
    expect(calls[0].update?.rejectionReason).toBe('Rejected by Meta');
  });

  it('normalises PENDING_REVIEW → PENDING (via shared normalizeStatus)', async () => {
    const { stub, calls } = makeDrizzleStub();
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: { event: 'PENDING_REVIEW', message_template_id: '1' },
      },
      stub
    );
    expect(calls[0].update?.status).toBe('PENDING');
  });

  it('logs and exits when meta_template_id is missing (no UPDATE issued)', async () => {
    const { stub, calls } = makeDrizzleStub();
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: { event: 'APPROVED' },
      },
      stub
    );
    expect(calls).toHaveLength(0);
  });

  it('logs a warning when the row is unknown locally and no WABA id was passed', async () => {
    const warn = spyOn(console, 'warn');
    const { stub, calls } = makeDrizzleStub([]);
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: {
          event: 'APPROVED',
          message_template_id: 'NEVER_SEEN',
          message_template_name: 'mystery',
        },
      },
      stub
    );
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('no WABA id');
    // Without a WABA id there is nothing to resolve the account with —
    // no config lookup, no insert.
    expect(calls).toHaveLength(1);
    expect(calls[0].insert).toBeUndefined();
  });
});

describe('handleTemplateWebhookChange — unknown template stub (#534)', () => {
  const CONFIG = { accountId: 'acc-1', userId: 'admin-1' };

  beforeEach(() => {
    spyOn(console, 'warn').mockImplementation(() => {});
    spyOn(console, 'info').mockImplementation(() => {});
    spyOn(console, 'error').mockImplementation(() => {});
  });

  it('inserts a stub row for a 0-row status update when exactly one config matches the WABA', async () => {
    const { stub, calls } = makeDrizzleStub([], { configRows: [CONFIG] });
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: {
          event: 'APPROVED',
          message_template_id: 555,
          message_template_name: 'created_in_meta',
          message_template_language: 'de',
        },
        wabaId: 'WABA-1',
      },
      stub
    );

    expect(calls.map((c) => c.table)).toEqual([
      'messageTemplates', // the original UPDATE (0 rows)
      'whatsappConfig', // resolve the tenant
      'messageTemplates', // the stub INSERT
    ]);
    expect(calls[1].select).toEqual(['accountId', 'userId']);
    expect(calls[1].filter).toEqual({ column: 'waba_id', value: 'WABA-1' });
    expect(calls[2].insert).toEqual({
      accountId: 'acc-1',
      userId: 'admin-1',
      metaTemplateId: '555',
      name: 'created_in_meta',
      language: 'de',
      bodyText: '',
      status: 'APPROVED',
      rejectionReason: null,
      submissionError: null,
    });
  });

  it('carries the rejection reason into the stub on REJECTED and defaults language to en_US', async () => {
    const { stub, calls } = makeDrizzleStub([], { configRows: [CONFIG] });
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: {
          event: 'REJECTED',
          message_template_id: '556',
          message_template_name: 'spammy',
          reason: 'INVALID_FORMAT',
        },
        wabaId: 'WABA-1',
      },
      stub
    );
    expect(calls[2].insert).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'INVALID_FORMAT',
      language: 'en_US',
    });
  });

  it('warns with the WABA id and inserts nothing when no config matches', async () => {
    const warn = spyOn(console, 'warn');
    const { stub, calls } = makeDrizzleStub([], { configRows: [] });
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: {
          event: 'APPROVED',
          message_template_id: '557',
          message_template_name: 'orphan',
        },
        wabaId: 'WABA-NOBODY',
      },
      stub
    );
    expect(calls).toHaveLength(2); // update + config lookup, no insert
    expect(calls.some((c) => c.insert)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('WABA WABA-NOBODY');
    expect(message).toContain('557');
    expect(message).toContain('no whatsapp_config rows');
  });

  it('refuses to guess the tenant when several configs share the WABA id', async () => {
    const warn = spyOn(console, 'warn');
    const { stub, calls } = makeDrizzleStub([], {
      configRows: [CONFIG, { accountId: 'acc-2', userId: 'admin-2' }],
    });
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: {
          event: 'APPROVED',
          message_template_id: '558',
          message_template_name: 'shared',
        },
        wabaId: 'WABA-1',
      },
      stub
    );
    expect(calls.some((c) => c.insert)).toBe(false);
    expect(String(warn.mock.calls[0][0])).toContain('2 whatsapp_config rows');
  });

  it('inserts a stub with quality_score (and no status) for a 0-row quality update', async () => {
    const warn = spyOn(console, 'warn');
    const { stub, calls } = makeDrizzleStub([], { configRows: [CONFIG] });
    await handleTemplateWebhookChange(
      {
        field: 'message_template_quality_update',
        value: {
          message_template_id: '559',
          message_template_name: 'created_in_meta',
          message_template_language: 'en_US',
          previous_quality_score: 'UNKNOWN',
          new_quality_score: 'RED',
        },
        wabaId: 'WABA-1',
      },
      stub
    );
    expect(calls[0].update).toEqual({ qualityScore: 'RED' });
    expect(calls[2].insert).toEqual({
      accountId: 'acc-1',
      userId: 'admin-1',
      metaTemplateId: '559',
      name: 'created_in_meta',
      language: 'en_US',
      bodyText: '',
      qualityScore: 'RED',
    });
    // `status` is deliberately absent — the column default applies.
    expect(calls[2].insert).not.toHaveProperty('status');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns (with the WABA id) on a 0-row quality update when the tenant cannot be resolved', async () => {
    const warn = spyOn(console, 'warn');
    const { stub, calls } = makeDrizzleStub([], { configRows: [] });
    await handleTemplateWebhookChange(
      {
        field: 'message_template_quality_update',
        value: {
          message_template_id: '560',
          message_template_name: 'orphan',
          new_quality_score: 'GREEN',
        },
        wabaId: 'WABA-NOBODY',
      },
      stub
    );
    expect(calls.some((c) => c.insert)).toBe(false);
    expect(String(warn.mock.calls[0][0])).toContain('quality update');
    expect(String(warn.mock.calls[0][0])).toContain('WABA WABA-NOBODY');
  });

  it('retries the update once when the stub insert hits a unique violation', async () => {
    const warn = spyOn(console, 'warn');
    const { stub, calls } = makeDrizzleStub([], {
      configRows: [CONFIG],
      insertError: { message: 'duplicate key', code: '23505' },
      retryUpdateRows: [{ id: 'row-raced' }],
    });
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: {
          event: 'PAUSED',
          message_template_id: '561',
          message_template_name: 'raced',
        },
        wabaId: 'WABA-1',
      },
      stub
    );
    const updates = calls.filter((c) => c.update);
    expect(updates).toHaveLength(2);
    expect(updates[1].update).toEqual(updates[0].update);
    expect(updates[1].filter).toEqual({
      column: 'meta_template_id',
      value: '561',
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not create a stub when the event has no template name', async () => {
    const warn = spyOn(console, 'warn');
    const { stub, calls } = makeDrizzleStub([], { configRows: [CONFIG] });
    await handleTemplateWebhookChange(
      {
        field: 'message_template_status_update',
        value: { event: 'APPROVED', message_template_id: '562' },
        wabaId: 'WABA-1',
      },
      stub
    );
    expect(calls).toHaveLength(1);
    expect(String(warn.mock.calls[0][0])).toContain('no message_template_name');
  });
});

describe('handleTemplateWebhookChange — quality update', () => {
  it('sets quality_score from new_quality_score', async () => {
    const { stub, calls } = makeDrizzleStub();
    await handleTemplateWebhookChange(
      {
        field: 'message_template_quality_update',
        value: {
          message_template_id: '99',
          previous_quality_score: 'GREEN',
          new_quality_score: 'YELLOW',
        },
      },
      stub
    );
    expect(calls[0].update).toEqual({ qualityScore: 'YELLOW' });
    expect(calls[0].filter).toEqual({
      column: 'meta_template_id',
      value: '99',
    });
  });

  it('stores null for unrecognised quality scores', async () => {
    const { stub, calls } = makeDrizzleStub();
    await handleTemplateWebhookChange(
      {
        field: 'message_template_quality_update',
        value: {
          message_template_id: '99',
          new_quality_score: 'PURPLE', // not a real Meta value
        },
      },
      stub
    );
    expect(calls[0].update).toEqual({ qualityScore: null });
  });
});

describe('handleTemplateWebhookChange — components update', () => {
  it('is an info-log no-op (does not write to DB)', async () => {
    const info = spyOn(console, 'info').mockImplementation(() => {});
    const { stub, calls } = makeDrizzleStub();
    await handleTemplateWebhookChange(
      {
        field: 'message_template_components_update',
        value: {
          message_template_id: '5',
          message_template_name: 'x',
        },
      },
      stub
    );
    expect(calls).toHaveLength(0);
    expect(info).toHaveBeenCalled();
  });
});

describe('handleTemplateWebhookChange — unknown field', () => {
  it('is a defensive no-op', async () => {
    const { stub, calls } = makeDrizzleStub();
    await handleTemplateWebhookChange(
      // Pretend Meta added a new template_* field we don't know about.
      // The route handler pre-filters via isTemplateWebhookField, but
      // the dispatch should still be safe if the filter is bypassed.
      {
        field: 'message_template_future_field',
        value: {},
      } as unknown as Parameters<typeof handleTemplateWebhookChange>[0],
      stub
    );
    expect(calls).toHaveLength(0);
  });
});
