import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { hoisted, stubGlobal, unstubAllGlobals } from '@test/support/mocks';

const h = hoisted(() => ({
  state: {
    owned: null as { id: string } | null,
    ownedCustomField: null as { id: string } | null,
    automations: [] as Record<string, unknown>[],
    steps: [] as Record<string, unknown>[],
    selectCalls: [] as string[],
    inserts: [] as { table: string; values: unknown }[],
    updates: [] as { table: string; values: Record<string, unknown> }[],
  },
}));

mock.module('@/lib/db', () => {
  const table = (name: string, fields: string[]) =>
    Object.fromEntries([
      ['__name', name],
      ...fields.map((field) => [field, `${name}.${field}`]),
    ]);
  const schema = {
    contacts: table('contacts', [
      'id',
      'accountId',
      'name',
      'email',
      'company',
      'phone',
      'updatedAt',
    ]),
    automations: table('automations', [
      'id',
      'accountId',
      'userId',
      'triggerType',
      'isActive',
      'executionCount',
      'lastExecutedAt',
    ]),
    automationLogs: table('automationLogs', [
      'id',
      'accountId',
      'stepsExecuted',
    ]),
    automationSteps: table('automationSteps', [
      'id',
      'automationId',
      'parentStepId',
      'branch',
      'stepType',
      'stepConfig',
      'position',
      'createdAt',
    ]),
    automationPendingExecutions: table('automationPendingExecutions', [
      'id',
      'accountId',
    ]),
    customFields: table('customFields', ['id', 'accountId']),
    contactCustomValues: table('contactCustomValues', [
      'contactId',
      'customFieldId',
    ]),
    contactTags: table('contactTags', ['id', 'contactId', 'tagId']),
    tags: table('tags', ['id', 'accountId']),
    profiles: table('profiles', ['userId', 'accountId']),
    conversations: table('conversations', ['id', 'accountId', 'contactId']),
    accounts: table('accounts', ['id', 'defaultCurrency']),
    deals: table('deals', ['id']),
  };

  const tableName = (value: unknown) => (value as { __name: string }).__name;
  const rowsFor = (name: string): unknown[] => {
    const { state } = h;
    if (name === 'contacts') return state.owned ? [state.owned] : [];
    if (name === 'automations') return state.automations;
    if (name === 'automationSteps') return state.steps;
    if (name === 'customFields')
      return state.ownedCustomField ? [state.ownedCustomField] : [];
    return [];
  };
  const thenable = <T extends object>(builder: T, read: () => unknown[]) =>
    Object.assign(builder, {
      // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally awaitable.
      then(
        resolve: (rows: unknown[]) => unknown,
        reject: (error: unknown) => unknown
      ) {
        return Promise.resolve(read()).then(resolve, reject);
      },
    });

  const db: Record<string, unknown> = {
    select() {
      let name = '';
      const builder = thenable(
        {
          from(value: unknown) {
            name = tableName(value);
            h.state.selectCalls.push(name);
            return builder;
          },
          where() {
            return builder;
          },
          innerJoin() {
            return builder;
          },
          orderBy() {
            return builder;
          },
          limit() {
            return Promise.resolve(rowsFor(name));
          },
        },
        () => rowsFor(name)
      );
      return builder;
    },
    insert(value: unknown) {
      const name = tableName(value);
      let values: unknown;
      const builder = thenable(
        {
          values(next: unknown) {
            values = next;
            h.state.inserts.push({ table: name, values: next });
            return builder;
          },
          returning() {
            return Promise.resolve(
              name === 'automationLogs' ? [{ id: 'log1' }] : []
            );
          },
          onConflictDoUpdate() {
            return builder;
          },
          onConflictDoNothing() {
            return builder;
          },
        },
        () => (values ? [] : [])
      );
      return builder;
    },
    update(value: unknown) {
      const name = tableName(value);
      const builder = thenable(
        {
          set(values: Record<string, unknown>) {
            h.state.updates.push({ table: name, values });
            return builder;
          },
          where() {
            return builder;
          },
        },
        () => []
      );
      return builder;
    },
    delete() {
      const builder = thenable({ where: () => builder }, () => []);
      return builder;
    },
    execute: () => Promise.resolve([]),
  };

  return { db, schema, sqlClient: {} };
});

mock.module('@/lib/automations/meta-send', () => ({
  engineSendText: mock(async () => ({ whatsapp_message_id: 'm1' })),
  engineSendTemplate: mock(async () => ({ whatsapp_message_id: 'm1' })),
  engineSendInteractive: mock(async () => ({ whatsapp_message_id: 'm1' })),
}));

import {
  runAutomationsForTrigger,
  triggerMatches,
} from '@/lib/automations/engine';
import type { Automation, KeywordMatchTriggerConfig } from '@/types';

const ACCOUNT = 'acct-1';

beforeEach(() => {
  h.state.owned = null;
  h.state.ownedCustomField = null;
  h.state.automations = [];
  h.state.steps = [];
  h.state.selectCalls = [];
  h.state.inserts = [];
  h.state.updates = [];
});

function automationRow(triggerType = 'new_message_received') {
  return {
    id: 'a1',
    accountId: ACCOUNT,
    userId: 'u1',
    name: 'automation',
    description: null,
    triggerType,
    triggerConfig: triggerType === 'tag_added' ? { tag_id: 'tag-a' } : {},
    isActive: true,
    executionCount: 0,
    lastExecutedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

function step(stepType: string, stepConfig: Record<string, unknown>) {
  return {
    id: 's1',
    automationId: 'a1',
    stepType,
    stepConfig,
    position: 0,
    parentStepId: null,
    branch: null,
    createdAt: '',
  };
}

describe('runAutomationsForTrigger — Drizzle tenant isolation', () => {
  it('refuses a contact outside the account before loading automations', async () => {
    h.state.automations = [automationRow()];
    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: 'new_message_received',
      contactId: 'foreign-contact',
    });
    expect(h.state.selectCalls).toEqual(['contacts']);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('dispatches an account-owned contact and persists account-scoped audit data', async () => {
    h.state.owned = { id: 'c1' };
    h.state.automations = [automationRow()];
    h.state.steps = [
      step('update_contact_field', { field: 'company', value: 'Acme' }),
    ];
    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: 'new_message_received',
      contactId: 'c1',
    });

    expect(h.state.inserts).toContainEqual({
      table: 'automationLogs',
      values: expect.objectContaining({
        accountId: ACCOUNT,
        contactId: 'c1',
        status: 'failed',
        stepsExecuted: [],
      }),
    });
    expect(h.state.updates).toContainEqual({
      table: 'contacts',
      values: expect.objectContaining({ company: 'Acme' }),
    });
    expect(
      h.state.updates.filter((call) => call.table === 'automationLogs').at(-1)
        ?.values
    ).toMatchObject({ status: 'success' });
  });

  it('upserts an account-owned custom field with interpolated variables', async () => {
    h.state.owned = { id: 'c1' };
    h.state.ownedCustomField = { id: 'cf1' };
    h.state.automations = [automationRow()];
    h.state.steps = [
      step('update_contact_field', {
        field: 'custom:cf1',
        value: '{{ vars.source }}',
      }),
    ];
    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: 'new_message_received',
      contactId: 'c1',
      context: { vars: { source: 'WhatsApp Ad' } },
    });
    expect(h.state.inserts).toContainEqual({
      table: 'contactCustomValues',
      values: { contactId: 'c1', customFieldId: 'cf1', value: 'WhatsApp Ad' },
    });
  });

  it('does not write a custom field that is not owned by the account', async () => {
    h.state.owned = { id: 'c1' };
    h.state.automations = [automationRow()];
    h.state.steps = [
      step('update_contact_field', { field: 'custom:foreign', value: 'x' }),
    ];
    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: 'new_message_received',
      contactId: 'c1',
    });
    expect(
      h.state.inserts.some((call) => call.table === 'contactCustomValues')
    ).toBe(false);
  });

  it('blocks private webhook destinations before fetch', async () => {
    const fetchSpy = mock(async () => ({ ok: true, status: 200 }));
    stubGlobal('fetch', fetchSpy);
    h.state.owned = { id: 'c1' };
    h.state.automations = [automationRow()];
    h.state.steps = [
      step('send_webhook', {
        url: 'http://169.254.169.254/latest/meta-data/',
        body_template: '{}',
      }),
    ];
    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: 'new_message_received',
      contactId: 'c1',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    unstubAllGlobals();
  });

  it('records a clear tag_added send failure when no conversation exists', async () => {
    h.state.owned = { id: 'c1' };
    h.state.automations = [automationRow('tag_added')];
    h.state.steps = [step('send_message', { text: 'Hello' })];
    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: 'tag_added',
      contactId: 'c1',
      context: { tag_id: 'tag-a' },
    });
    const logUpdate = h.state.updates
      .filter((call) => call.table === 'automationLogs')
      .at(-1)?.values;
    expect(logUpdate).toMatchObject({
      status: 'failed',
      errorMessage:
        'tag_added automation cannot send: contact has no existing conversation',
    });
  });
});

function triggerAutomation(
  trigger_type: Automation['trigger_type'],
  trigger_config: Automation['trigger_config']
): Automation {
  return {
    id: 'a1',
    account_id: ACCOUNT,
    user_id: 'u1',
    name: 'trigger',
    trigger_type,
    trigger_config,
    is_active: true,
    execution_count: 0,
    created_at: '',
    updated_at: '',
  };
}

describe('triggerMatches', () => {
  it('matches interactive replies and tags exactly', () => {
    expect(
      triggerMatches(
        triggerAutomation('interactive_reply', { reply_ids: ['yes'] }),
        {
          interactive_reply_id: 'yes',
        }
      )
    ).toBe(true);
    expect(
      triggerMatches(
        triggerAutomation('interactive_reply', { reply_ids: ['yes'] }),
        {
          interactive_reply_id: 'yes_please',
        }
      )
    ).toBe(false);
    expect(
      triggerMatches(triggerAutomation('tag_added', { tag_id: 'tag-a' }), {
        tag_id: 'tag-a',
      })
    ).toBe(true);
  });

  function keyword(
    cfg: Partial<KeywordMatchTriggerConfig> & { keywords: string[] }
  ) {
    return triggerAutomation('keyword_match', {
      match_type: 'contains',
      ...cfg,
    });
  }

  it('preserves contains and exact semantics', () => {
    expect(
      triggerMatches(keyword({ keywords: ['cat'] }), {
        message_text: 'category',
      })
    ).toBe(true);
    expect(
      triggerMatches(keyword({ keywords: ['hi'], match_type: 'exact' }), {
        message_text: 'hi there',
      })
    ).toBe(false);
  });

  it('supports Unicode-aware whole-word matching and literal regex characters', () => {
    expect(
      triggerMatches(keyword({ keywords: ['k'], match_type: 'word' }), {
        message_text: 'thanks',
      })
    ).toBe(false);
    expect(
      triggerMatches(keyword({ keywords: ['안녕'], match_type: 'word' }), {
        message_text: '저기 안녕 하세요',
      })
    ).toBe(true);
    expect(() =>
      triggerMatches(keyword({ keywords: ['('], match_type: 'word' }), {
        message_text: '(',
      })
    ).not.toThrow();
  });

  it('respects case sensitivity in word mode', () => {
    expect(
      triggerMatches(
        keyword({ keywords: ['Hi'], match_type: 'word', case_sensitive: true }),
        { message_text: 'hi' }
      )
    ).toBe(false);
  });
});
