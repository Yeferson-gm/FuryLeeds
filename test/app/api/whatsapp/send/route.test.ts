import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import {
  createDrizzleMock,
  type DbCall,
} from '@test/lib/whatsapp/drizzle-mock';
import { hoisted } from '@test/support/mocks';

// ---------------------------------------------------------------------------
// Tests for the `contact_id` send path (issue #296): sending an approved
// template to a single contact from the Contact detail view. The route must
// find-or-create the contact's conversation server-side, then run the normal
// send + persistence path — no inbound message required to bootstrap a thread.
// ---------------------------------------------------------------------------

// Records of what the route wrote, so we can assert the right rows landed.
let dbCalls: DbCall[] = [];

// Toggles for the per-test scenario.
let existingConversation: Record<string, unknown> | null = null;
let contactRow: Record<string, unknown> | null = null;
// The caller's role. Sending requires 'agent'; 'viewer' must be refused before
// anything reaches Meta.
type CallerRole = 'admin' | 'agent' | 'viewer';
let callerRole: CallerRole = 'admin';

const CONTACT = {
  id: 'contact-1',
  accountId: 'acct-1',
  phone: '+15551234567',
};

function makeDrizzleMock() {
  const conversationId = existingConversation?.id ?? 'conv-new';
  const conversationSelects: unknown[][] = existingConversation
    ? [[{ id: conversationId }]]
    : [[]];
  conversationSelects.push([
    {
      id: conversationId,
      contactId: CONTACT.id,
      contactPhone: CONTACT.phone,
      contactWaUserId: null,
    },
  ]);

  return createDrizzleMock({
    select: {
      contacts: [contactRow ? [{ id: contactRow.id }] : []],
      conversations: conversationSelects,
      whatsappConfig: [
        [
          {
            id: 'cfg-1',
            accountId: 'acct-1',
            phoneNumberId: 'PNID-1',
            accessToken: 'enc-token',
          },
        ],
      ],
      messageTemplates: [[]],
    },
    insert: {
      conversations: [[{ id: 'conv-new' }]],
      messages: [[{ id: 'msg-1' }]],
    },
  });
}

const authMocks = hoisted(() => {
  class ForbiddenError extends Error {
    readonly status = 403;

    constructor(message = 'Forbidden') {
      super(message);
      this.name = 'ForbiddenError';
    }
  }

  return {
    ForbiddenError,
    requireRole: mock(),
    toErrorResponse: mock((error: unknown) => {
      if (error instanceof ForbiddenError) {
        return Response.json(
          { error: error.message },
          { status: error.status }
        );
      }
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }),
  };
});

mock.module('@/lib/auth/account', () => ({
  ForbiddenError: authMocks.ForbiddenError,
  requireRole: authMocks.requireRole,
  toErrorResponse: authMocks.toErrorResponse,
}));

mock.module('@/lib/whatsapp/encryption', () => ({
  decrypt: mock(() => 'plaintext-token'),
}));

const { sendTemplateMessage } = hoisted(() => ({
  sendTemplateMessage: mock(async () => ({ messageId: 'wamid-1' })),
}));
mock.module('@/lib/whatsapp/meta-api', () => ({
  sendTemplateMessage,
  sendTextMessage: mock(),
  sendMediaMessage: mock(),
  sendInteractiveButtons: mock(),
  sendInteractiveList: mock(),
}));

import { POST } from '@/app/api/whatsapp/send/route';

function postContactTemplate(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: 'contact-1',
        message_type: 'template',
        template_name: 'order_update',
        template_language: 'en_US',
        template_message_params: { body: ['Acme', '#1234'] },
        template_params: ['Acme', '#1234'],
        ...overrides,
      }),
    })
  );
}

function insertsFor(table: DbCall['table']) {
  return dbCalls.filter(
    (call) => call.kind === 'insert' && call.table === table
  );
}

function resetScenario() {
  dbCalls = [];
  authMocks.requireRole.mockReset();
  authMocks.requireRole.mockImplementation(async (minimumRole: string) => {
    if (callerRole === 'viewer' && minimumRole === 'agent') {
      throw new authMocks.ForbiddenError(
        "This action requires the 'agent' role or higher"
      );
    }

    const { db, calls } = makeDrizzleMock();
    dbCalls = calls;
    return {
      db,
      accountId: 'acct-1',
      userId: 'user-1',
      role: callerRole,
    };
  });
  sendTemplateMessage.mockClear();
}

describe('POST /api/whatsapp/send — contact_id template path', () => {
  beforeEach(() => {
    existingConversation = null;
    contactRow = CONTACT;
    callerRole = 'admin';
    resetScenario();
  });

  afterEach(() => {
    mock.clearAllMocks();
  });

  it('creates a conversation for a contact with none, then sends the template', async () => {
    const res = await postContactTemplate();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.whatsapp_message_id).toBe('wamid-1');

    // A conversation was created for this contact.
    const conversationInserts = insertsFor('conversations');
    expect(conversationInserts).toHaveLength(1);
    expect(conversationInserts[0].values).toMatchObject({
      accountId: 'acct-1',
      contactId: 'contact-1',
    });

    // The template was sent to the contact's number.
    expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
    const args = (sendTemplateMessage.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    // Meta wants the bare E.164 digits — sanitizePhoneForMeta strips the '+'.
    expect(args.to).toBe('15551234567');
    expect(args.templateName).toBe('order_update');

    // The outbound message was persisted under the new conversation.
    const messageInserts = insertsFor('messages');
    expect(messageInserts).toHaveLength(1);
    expect(messageInserts[0].values).toMatchObject({
      conversationId: 'conv-new',
      contentType: 'template',
      templateName: 'order_update',
      senderType: 'agent',
    });
  });

  it('reuses an existing conversation instead of creating a duplicate', async () => {
    existingConversation = {
      id: 'conv-existing',
      accountId: 'acct-1',
      contactId: 'contact-1',
      contact: CONTACT,
    };

    const res = await postContactTemplate();
    expect(res.status).toBe(200);

    expect(insertsFor('conversations')).toHaveLength(0);
    expect(insertsFor('messages')[0].values).toMatchObject({
      conversationId: 'conv-existing',
    });
  });

  it('404s when the contact is not in the caller account', async () => {
    contactRow = null;

    const res = await postContactTemplate();
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/no se encontró el contacto/i);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('400s when neither conversation_id nor contact_id is provided', async () => {
    const res = await POST(
      new Request('http://localhost/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_type: 'template', template_name: 'x' }),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/whatsapp/send — role enforcement', () => {
  beforeEach(() => {
    existingConversation = {
      id: 'conv-existing',
      accountId: 'acct-1',
      contactId: 'contact-1',
      contact: CONTACT,
    };
    contactRow = CONTACT;
    callerRole = 'admin';
    resetScenario();
  });

  afterEach(() => {
    mock.clearAllMocks();
  });

  it('refuses a viewer with 403 and never reaches Meta', async () => {
    // The authorization gate must run before any outbound call.
    callerRole = 'viewer';
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});

    const res = await postContactTemplate();

    expect(res.status).toBe(403);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect(insertsFor('messages')).toHaveLength(0);
  });

  it('allows an agent through', async () => {
    callerRole = 'agent';

    const res = await postContactTemplate();

    expect(res.status).toBe(200);
    expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
  });
});
