import { and, eq } from 'drizzle-orm';
import { db as appDb, schema } from '@/lib/db';
import {
  engineSendInteractiveButtons,
  engineSendInteractiveList,
} from '@/lib/flows/meta-send';
import type { WhatsAppQueryDb } from '@/lib/whatsapp/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import { sendTemplateMessage, sendTextMessage } from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  phoneVariants,
} from '@/lib/whatsapp/phone-utils';
import {
  resolveTemplateRow,
  templateContentText,
} from '@/lib/whatsapp/template-body';
import { resolveContactSendTarget } from '@/lib/whatsapp/wa-identity';

// ------------------------------------------------------------
// Automation-side Meta sender.
//
// Mirrors the logic in src/app/api/whatsapp/send/route.ts. The engine has no
// request session, so every query is explicitly account-scoped and accepts the
// user / conversation / contact identifiers the engine already has
// on hand. Kept here (rather than refactoring the user-facing send
// route) to avoid risk to the working manual-send path — they can
// converge in a later refactor.
// ------------------------------------------------------------

interface SendTextArgs {
  /** Account-level tenancy key. Drives contact + whatsapp_config
   *  lookups so an automation authored by user A still sends through
   *  the WhatsApp number user B saved on the same account. */
  accountId: string;
  /** Original author of the automation/flow — used for INSERT audit
   *  columns (messages.sender_id-ish) and for resolving the agent's
   *  identity in logs. Not consulted for tenancy. */
  userId: string;
  conversationId: string;
  contactId: string;
  text: string;
}

interface SendTemplateArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  templateName: string;
  language?: string;
  params?: string[];
}

export async function engineSendText(
  args: SendTextArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'text' });
}

export async function engineSendTemplate(
  args: SendTemplateArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'template' });
}

interface SendInteractiveArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  payload: InteractiveMessagePayload;
}

/**
 * Send an interactive (reply-buttons or list) message from the
 * automation engine.
 *
 * Delegates to the Flows interactive senders
 * (`engineSendInteractiveButtons` / `engineSendInteractiveList`), which
 * already own the account-scoped lookup, phone-variant retry, and the
 * `messages` insert with `interactive_payload` + `sender_type='bot'`.
 * Both engines want identical behaviour here, so there's one
 * implementation rather than a second hand-rolled copy that could drift.
 */
export async function engineSendInteractive(
  args: SendInteractiveArgs
): Promise<{ whatsapp_message_id: string }> {
  const { payload, accountId, userId, conversationId, contactId } = args;
  const common = { accountId, userId, conversationId, contactId };
  if (payload.kind === 'buttons') {
    return engineSendInteractiveButtons({
      ...common,
      bodyText: payload.body,
      headerText: payload.header,
      footerText: payload.footer,
      buttons: payload.buttons,
    });
  }
  return engineSendInteractiveList({
    ...common,
    bodyText: payload.body,
    buttonLabel: payload.button_label,
    headerText: payload.header,
    footerText: payload.footer,
    sections: payload.sections,
  });
}

type SendInput =
  | (SendTextArgs & { kind: 'text' })
  | (SendTemplateArgs & { kind: 'template' });

async function sendViaMeta(
  input: SendInput
): Promise<{ whatsapp_message_id: string }> {
  const database: WhatsAppQueryDb = appDb;

  // Scope the contact + config lookups by account_id, not user_id.
  // Without this filter, an authenticated user could fire their own
  // automations against another tenant's contact UUID and send via
  // their own WhatsApp config to that contact's phone. The 017
  // migration moved both tables to account-scoped tenancy, so the
  // check is the same defense-in-depth as before, just keyed on the
  // new tenancy column.
  const [contact] = await database
    .select({
      id: schema.contacts.id,
      phone: schema.contacts.phone,
      wa_user_id: schema.contacts.waUserId,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.id, input.contactId),
        eq(schema.contacts.accountId, input.accountId)
      )
    )
    .limit(1);
  if (!contact) {
    throw new Error('contact not found for this account');
  }

  // Phone number, or the business-scoped user ID when Meta has never
  // given us a number for this customer (issue #519).
  const sendTarget = resolveContactSendTarget(contact);
  if (!sendTarget) {
    throw new Error(
      `contact has no usable WhatsApp address (phone: ${contact.phone || 'none'})`
    );
  }
  const sanitized = sendTarget.target;

  const [config] = await database
    .select()
    .from(schema.whatsappConfig)
    .where(eq(schema.whatsappConfig.accountId, input.accountId))
    .limit(1);
  if (!config) {
    throw new Error('WhatsApp not configured for this account');
  }

  const accessToken = decrypt(config.accessToken);

  const [conversation] = await database
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, input.conversationId),
        eq(schema.conversations.accountId, input.accountId),
        eq(schema.conversations.contactId, input.contactId)
      )
    )
    .limit(1);
  if (!conversation) {
    throw new Error('conversation not found for this account and contact');
  }

  // Local template row — read for the body we persist below, not for
  // the Meta payload (the wire shape is deliberately unchanged here).
  // A missing row is fine: the send still goes out, we just can't
  // reconstruct the text the customer saw.
  const templateRow =
    input.kind === 'template'
      ? (
          await resolveTemplateRow(
            database,
            input.accountId,
            input.templateName,
            input.language
          )
        ).row
      : null;

  const attempt = async (phone: string): Promise<string> => {
    if (input.kind === 'template') {
      const r = await sendTemplateMessage({
        phoneNumberId: config.phoneNumberId,
        accessToken,
        to: phone,
        templateName: input.templateName,
        language: input.language,
        bodyParams: input.params,
      });
      return r.messageId;
    }
    const r = await sendTextMessage({
      phoneNumberId: config.phoneNumberId,
      accessToken,
      to: phone,
      text: input.text,
    });
    return r.messageId;
  };

  // Same phone-variant retry as /api/whatsapp/send — Meta sandbox and
  // numbers registered with/without a trunk 0 both require this to
  // reliably land a message.
  const variants = sendTarget.isPhone ? phoneVariants(sanitized) : [sanitized];
  let workingPhone = sanitized;
  let waMessageId = '';
  let lastError: unknown = null;
  for (const v of variants) {
    try {
      waMessageId = await attempt(v);
      workingPhone = v;
      lastError = null;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRecipientNotAllowedError(msg)) throw err;
      lastError = err;
    }
  }
  if (lastError) throw lastError;

  if (sendTarget.isPhone && workingPhone !== sanitized) {
    await database
      .update(schema.contacts)
      .set({ phone: workingPhone, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.contacts.id, contact.id),
          eq(schema.contacts.accountId, input.accountId)
        )
      );
  }

  // Persist the sent message so it appears in the inbox with a real
  // Meta message id. sender_type='bot' distinguishes automation sends
  // from manual agent sends.
  const content_type = input.kind === 'template' ? 'template' : 'text';
  // Templates persist the substituted body, same as the manual and
  // public-API send paths. This was unconditionally null, so every
  // automation template send rendered as an empty bubble (issue #483).
  const content_text =
    input.kind === 'text'
      ? input.text
      : templateContentText(templateRow, input.params ?? []);
  const template_name = input.kind === 'template' ? input.templateName : null;

  try {
    await database.insert(schema.messages).values({
      conversationId: input.conversationId,
      senderType: 'bot',
      contentType: content_type,
      contentText: content_text,
      templateName: template_name,
      messageId: waMessageId,
      status: 'sent',
    });
  } catch (error) {
    // Meta already accepted the message, so preserve that distinction in the
    // execution log rather than reporting a transport failure.
    throw new Error(
      `sent to Meta but DB insert failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  const now = new Date().toISOString();
  await database
    .update(schema.conversations)
    .set({
      lastMessageText:
        input.kind === 'template'
          ? (content_text ?? `[template:${input.templateName}]`)
          : input.text,
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.conversations.id, input.conversationId),
        eq(schema.conversations.accountId, input.accountId)
      )
    );

  return { whatsapp_message_id: waMessageId };
}
