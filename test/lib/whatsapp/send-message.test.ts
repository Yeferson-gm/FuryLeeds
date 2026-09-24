import { describe, expect, it, mock } from 'bun:test';
import { mocked } from '@test/support/mocks';
import type { WhatsAppQueryDb } from '@/lib/whatsapp/db';
import {
  SendMessageError,
  type SendMessageParams,
  sendMessageToConversation,
} from '@/lib/whatsapp/send-message';
import { createDrizzleMock } from './drizzle-mock';

// A db that explodes if touched — these tests cover the param
// validation that MUST short-circuit before any query runs.
function noDb(): WhatsAppQueryDb {
  return {
    select() {
      throw new Error('db should not be queried for invalid params');
    },
  } as unknown as WhatsAppQueryDb;
}

async function expectSendError(
  params: SendMessageParams,
  status: number,
  messageMatch?: RegExp
) {
  await expect(
    sendMessageToConversation(noDb(), 'acct-1', params)
  ).rejects.toBeInstanceOf(SendMessageError);
  await sendMessageToConversation(noDb(), 'acct-1', params).catch(
    (e: SendMessageError) => {
      expect(e.status).toBe(status);
      if (messageMatch) expect(e.message).toMatch(messageMatch);
    }
  );
}

describe('sendMessageToConversation — param validation (pre-DB)', () => {
  const base = { conversationId: 'cv-1' };

  it('requires conversation_id and message_type', async () => {
    await expectSendError({ conversationId: '', messageType: 'text' }, 400);
    await expectSendError({ conversationId: 'cv-1', messageType: '' }, 400);
  });

  it('rejects an unsupported message_type', async () => {
    await expectSendError(
      { ...base, messageType: 'carrier-pigeon' },
      400,
      /Unsupported message_type/
    );
  });

  it('requires content_text for text messages', async () => {
    await expectSendError(
      { ...base, messageType: 'text' },
      400,
      /content_text is required/
    );
  });

  it('requires template_name for template messages', async () => {
    await expectSendError(
      { ...base, messageType: 'template' },
      400,
      /template_name is required/
    );
  });

  it('requires media_url for media kinds', async () => {
    for (const kind of ['image', 'video', 'document', 'audio']) {
      await expectSendError(
        { ...base, messageType: kind },
        400,
        /media_url is required/
      );
    }
  });

  it('rejects an over-long media caption (non-audio)', async () => {
    await expectSendError(
      {
        ...base,
        messageType: 'image',
        mediaUrl: 'https://x/y.jpg',
        contentText: 'a'.repeat(1025),
      },
      400,
      /1024-character limit/
    );
  });

  it('requires a valid interactive payload for interactive messages', async () => {
    // Missing payload entirely.
    await expectSendError(
      { ...base, messageType: 'interactive' },
      400,
      /payload is required/
    );
    // Too many buttons.
    await expectSendError(
      {
        ...base,
        messageType: 'interactive',
        interactivePayload: {
          kind: 'buttons',
          body: 'Pick one',
          buttons: [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
            { id: 'c', title: 'C' },
            { id: 'd', title: 'D' },
          ],
        },
      },
      400,
      /at most 3 buttons/
    );
    // Over-long button title.
    await expectSendError(
      {
        ...base,
        messageType: 'interactive',
        interactivePayload: {
          kind: 'buttons',
          body: 'Pick one',
          buttons: [{ id: 'a', title: 'x'.repeat(21) }],
        },
      },
      400,
      /20-character limit/
    );
  });

  it('allows a long "caption" on audio (audio carries none) — so it reaches the DB', async () => {
    // Audio is exempt from the caption cap, so validation passes and we
    // proceed to the conversation lookup — proven by the stub throwing.
    const spy = mock(() => {
      throw new Error('reached DB');
    });
    const db = { select: spy } as unknown as WhatsAppQueryDb;
    await expect(
      sendMessageToConversation(db, 'acct-1', {
        ...base,
        messageType: 'audio',
        mediaUrl: 'https://x/y.ogg',
        contentText: 'a'.repeat(2000),
      })
    ).rejects.toThrow('reached DB');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('SendMessageError', () => {
  it('carries a machine code and an HTTP status', () => {
    const e = new SendMessageError('meta_error', 'boom', 502);
    expect(e.code).toBe('meta_error');
    expect(e.status).toBe(502);
    expect(e).toBeInstanceOf(Error);
  });
});

// ============================================================
// Full send path — what actually lands in `messages` (issue #483).
// ============================================================

const sendTemplateMessage = mock(async () => ({ messageId: 'wamid.1' }));

// Stub only the senders — the module also exports INTERACTIVE_LIMITS,
// which `interactive.ts` needs for the payload validation covered above.
const actualMetaApi = await import('@/lib/whatsapp/meta-api');
mock.module('@/lib/whatsapp/meta-api', () => ({
  ...actualMetaApi,
  sendTextMessage: mock(async () => ({ messageId: 'wamid.text' })),
  sendTemplateMessage: (...args: unknown[]) =>
    (sendTemplateMessage as unknown as (...a: unknown[]) => unknown)(...args),
  sendMediaMessage: mock(async () => ({ messageId: 'wamid.media' })),
  sendInteractiveButtons: mock(async () => ({ messageId: 'wamid.btn' })),
  sendInteractiveList: mock(async () => ({ messageId: 'wamid.list' })),
}));

mock.module('@/lib/whatsapp/encryption', () => ({
  decrypt: (value: string) => value,
}));

interface CapturedWrites {
  message?: Record<string, unknown>;
  conversation?: Record<string, unknown>;
}

/** Drizzle fake for the full send path, including persisted writes. */
function sendPathDb(
  templateRows: unknown[],
  captured: CapturedWrites,
  contact: Record<string, unknown> = { id: 'ct-1', phone: '+15551234567' }
): WhatsAppQueryDb {
  const { db, calls } = createDrizzleMock({
    select: {
      conversations: [
        [
          {
            id: 'cv-1',
            contactId: contact.id,
            contactPhone: contact.phone ?? null,
            contactWaUserId: contact.wa_user_id ?? null,
          },
        ],
      ],
      whatsappConfig: [
        [
          {
            id: 'cfg-1',
            phoneNumberId: 'pn-1',
            accessToken: 'token',
          },
        ],
      ],
      messageTemplates: [templateRows],
    },
    insert: { messages: [[{ id: 'msg-1' }]] },
  });

  Object.defineProperties(captured, {
    message: {
      get: () =>
        calls.find(
          (call) => call.kind === 'insert' && call.table === 'messages'
        )?.values,
    },
    conversation: {
      get: () =>
        calls.find(
          (call) => call.kind === 'update' && call.table === 'conversations'
        )?.values,
    },
  });

  return db;
}

const TEMPLATE_ROW = {
  id: 'tpl-1',
  accountId: 'acct-1',
  userId: 'u-1',
  name: 'order_update',
  category: 'Utility',
  language: 'en',
  headerType: null,
  headerContent: null,
  headerHandle: null,
  headerMediaUrl: null,
  bodyText: 'Your order {{1}} ships on {{2}}',
  footerText: null,
  buttons: null,
  sampleValues: null,
  status: 'APPROVED',
  metaTemplateId: 'meta-1',
  rejectionReason: null,
  qualityScore: null,
  submissionError: null,
  lastSubmittedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('sendMessageToConversation — template persistence (#483)', () => {
  it('stores the substituted body when the caller sends no text', async () => {
    const captured: CapturedWrites = {};
    const result = await sendMessageToConversation(
      sendPathDb([TEMPLATE_ROW], captured),
      'acct-1',
      {
        conversationId: 'cv-1',
        messageType: 'template',
        templateName: 'order_update',
        templateParams: ['A123', 'Friday'],
      }
    );

    expect(result.whatsappMessageId).toBe('wamid.1');
    // Was NULL before the fix — the Inbox rendered an empty bubble.
    expect(captured.message?.contentText).toBe(
      'Your order A123 ships on Friday'
    );
    expect(captured.message?.templateName).toBe('order_update');
    // …and the conversation-list preview reads the body, not '[template]'.
    expect(captured.conversation?.lastMessageText).toBe(
      'Your order A123 ships on Friday'
    );
  });

  it('reads body values out of the structured params shape too', async () => {
    const captured: CapturedWrites = {};
    await sendMessageToConversation(
      sendPathDb([TEMPLATE_ROW], captured),
      'acct-1',
      {
        conversationId: 'cv-1',
        messageType: 'template',
        templateName: 'order_update',
        templateMessageParams: { body: ['B456', 'Monday'] },
      }
    );
    expect(captured.message?.contentText).toBe(
      'Your order B456 ships on Monday'
    );
  });

  it("does not override the composer's pre-rendered text", async () => {
    const captured: CapturedWrites = {};
    await sendMessageToConversation(
      sendPathDb([TEMPLATE_ROW], captured),
      'acct-1',
      {
        conversationId: 'cv-1',
        messageType: 'template',
        templateName: 'order_update',
        templateParams: ['A123', 'Friday'],
        contentText: 'rendered by the composer',
      }
    );
    expect(captured.message?.contentText).toBe('rendered by the composer');
  });

  it("sends the local row's language when the caller names none", async () => {
    sendTemplateMessage.mockClear();
    const captured: CapturedWrites = {};
    await sendMessageToConversation(
      sendPathDb([TEMPLATE_ROW], captured),
      'acct-1',
      {
        conversationId: 'cv-1',
        messageType: 'template',
        templateName: 'order_update',
        templateParams: ['A123', 'Friday'],
      }
    );
    // Previously pinned to 'en_US', which matched no row and made Meta
    // reject the send as a missing translation.
    expect(
      (
        sendTemplateMessage.mock.calls[0] as unknown as [{ language: string }]
      )[0].language
    ).toBe('en');
  });

  it('leaves content_text null when the account has no local template row', async () => {
    const captured: CapturedWrites = {};
    await sendMessageToConversation(sendPathDb([], captured), 'acct-1', {
      conversationId: 'cv-1',
      messageType: 'template',
      templateName: 'never_synced',
      templateParams: ['A123'],
    });
    // Nothing to render from — the bubble falls back to the template
    // name rather than inventing a body.
    expect(captured.message?.contentText).toBeNull();
    expect(captured.conversation?.lastMessageText).toBe('[template]');
  });
});

// ============================================================
// Business-scoped user IDs (issue #519)
//
// Meta withholds the phone number for a customer who has adopted a
// WhatsApp username, so their contact row carries only `wa_user_id`.
// The send path used to reject those outright with "Contact phone
// number not found" — the business could receive their messages but
// never answer them.
// ============================================================

const BSUID = 'US.13491208655302741918';

describe('sendMessageToConversation — BSUID recipients (#519)', () => {
  it('sends to the BSUID when the contact has no phone number', async () => {
    const captured: CapturedWrites = {};
    const { sendTextMessage } = await import('@/lib/whatsapp/meta-api');
    mocked(sendTextMessage).mockClear();

    await sendMessageToConversation(
      sendPathDb([], captured, { id: 'ct-1', phone: '', wa_user_id: BSUID }),
      'acct-1',
      { conversationId: 'cv-1', messageType: 'text', contentText: 'hi' }
    );

    expect(mocked(sendTextMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ to: BSUID })
    );
  });

  it('still prefers the phone number when the contact has both', async () => {
    const captured: CapturedWrites = {};
    const { sendTextMessage } = await import('@/lib/whatsapp/meta-api');
    mocked(sendTextMessage).mockClear();

    await sendMessageToConversation(
      sendPathDb([], captured, {
        id: 'ct-1',
        phone: '+15551234567',
        wa_user_id: BSUID,
      }),
      'acct-1',
      { conversationId: 'cv-1', messageType: 'text', contentText: 'hi' }
    );

    // Only the phone path supports the trunk-prefix variant retry, so
    // it wins whenever we have a usable number.
    expect(mocked(sendTextMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ to: '15551234567' })
    );
  });

  it('falls back to the BSUID when the stored phone is unusable', async () => {
    const captured: CapturedWrites = {};
    const { sendTextMessage } = await import('@/lib/whatsapp/meta-api');
    mocked(sendTextMessage).mockClear();

    await sendMessageToConversation(
      sendPathDb([], captured, {
        id: 'ct-1',
        phone: 'not-a-number',
        wa_user_id: BSUID,
      }),
      'acct-1',
      { conversationId: 'cv-1', messageType: 'text', contentText: 'hi' }
    );

    expect(mocked(sendTextMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ to: BSUID })
    );
  });

  it('400s when the contact has neither a usable phone nor a BSUID', async () => {
    const captured: CapturedWrites = {};
    await expect(
      sendMessageToConversation(
        sendPathDb([], captured, { id: 'ct-1', phone: '' }),
        'acct-1',
        { conversationId: 'cv-1', messageType: 'text', contentText: 'hi' }
      )
    ).rejects.toThrow(/no phone number or WhatsApp user ID/);
  });

  it('ignores a wa_user_id that is not BSUID-shaped', async () => {
    const captured: CapturedWrites = {};
    await expect(
      sendMessageToConversation(
        sendPathDb([], captured, {
          id: 'ct-1',
          phone: '',
          wa_user_id: 'garbage',
        }),
        'acct-1',
        { conversationId: 'cv-1', messageType: 'text', contentText: 'hi' }
      )
    ).rejects.toThrow(/no phone number or WhatsApp user ID/);
  });
});
