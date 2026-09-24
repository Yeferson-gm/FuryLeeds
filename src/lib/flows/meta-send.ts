import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import {
  type InteractiveButton,
  type InteractiveListSection,
  type MediaKind,
  sendInteractiveButtons,
  sendInteractiveList,
  sendMediaMessage,
  sendTextMessage,
} from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  phoneVariants,
} from '@/lib/whatsapp/phone-utils';
import { resolveContactSendTarget } from '@/lib/whatsapp/wa-identity';

type FlowDatabase = typeof db;

export async function loadAccountMetaCredentials(
  database: FlowDatabase,
  accountId: string
): Promise<{ phoneNumberId: string; accessToken: string }> {
  const [config] = await database
    .select({
      phoneNumberId: schema.whatsappConfig.phoneNumberId,
      accessToken: schema.whatsappConfig.accessToken,
    })
    .from(schema.whatsappConfig)
    .where(eq(schema.whatsappConfig.accountId, accountId))
    .limit(1);
  if (!config) throw new Error('WhatsApp not configured for this account');
  return {
    phoneNumberId: config.phoneNumberId,
    accessToken: decrypt(config.accessToken),
  };
}

interface SendBaseArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
}

interface SendTextEngineArgs extends SendBaseArgs {
  text: string;
  aiGenerated?: boolean;
}

interface SendMediaEngineArgs extends SendBaseArgs {
  kind: MediaKind;
  link: string;
  caption?: string;
  filename?: string;
}

interface SendInteractiveButtonsEngineArgs extends SendBaseArgs {
  bodyText: string;
  buttons: InteractiveButton[];
  headerText?: string;
  footerText?: string;
}

interface SendInteractiveListEngineArgs extends SendBaseArgs {
  bodyText: string;
  buttonLabel: string;
  sections: InteractiveListSection[];
  headerText?: string;
  footerText?: string;
}

async function loadSendContext(args: SendBaseArgs) {
  const [contact] = await db
    .select({
      id: schema.contacts.id,
      phone: schema.contacts.phone,
      waUserId: schema.contacts.waUserId,
    })
    .from(schema.contacts)
    .innerJoin(
      schema.conversations,
      and(
        eq(schema.conversations.id, args.conversationId),
        eq(schema.conversations.contactId, schema.contacts.id),
        eq(schema.conversations.accountId, args.accountId)
      )
    )
    .where(
      and(
        eq(schema.contacts.id, args.contactId),
        eq(schema.contacts.accountId, args.accountId)
      )
    )
    .limit(1);
  if (!contact) throw new Error('contact not found for this account');

  const sendTarget = resolveContactSendTarget({
    phone: contact.phone,
    wa_user_id: contact.waUserId,
  });
  if (!sendTarget) {
    throw new Error(
      `contact has no usable WhatsApp address (phone: ${contact.phone || 'none'})`
    );
  }
  const credentials = await loadAccountMetaCredentials(db, args.accountId);
  return { contact, sendTarget, ...credentials };
}

async function sendWithPhoneVariants(
  args: SendBaseArgs,
  attempt: (
    target: string,
    credentials: {
      phoneNumberId: string;
      accessToken: string;
    }
  ) => Promise<string>
): Promise<string> {
  const { contact, sendTarget, phoneNumberId, accessToken } =
    await loadSendContext(args);
  const variants = sendTarget.isPhone
    ? phoneVariants(sendTarget.target)
    : [sendTarget.target];
  let workingTarget = sendTarget.target;
  let lastError: unknown;

  for (const target of variants) {
    try {
      const messageId = await attempt(target, { phoneNumberId, accessToken });
      workingTarget = target;
      lastError = undefined;
      if (sendTarget.isPhone && workingTarget !== sendTarget.target) {
        await db
          .update(schema.contacts)
          .set({ phone: workingTarget })
          .where(
            and(
              eq(schema.contacts.id, contact.id),
              eq(schema.contacts.accountId, args.accountId)
            )
          );
      }
      return messageId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isRecipientNotAllowedError(message)) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error('WhatsApp send failed');
}

async function updateConversation(
  args: SendBaseArgs,
  lastMessageText: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(schema.conversations)
    .set({ lastMessageText, lastMessageAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.conversations.id, args.conversationId),
        eq(schema.conversations.accountId, args.accountId)
      )
    );
}

export async function engineSendText(
  args: SendTextEngineArgs
): Promise<{ whatsapp_message_id: string }> {
  const messageId = await sendWithPhoneVariants(
    args,
    async (to, credentials) =>
      (
        await sendTextMessage({
          ...credentials,
          to,
          text: args.text,
        })
      ).messageId
  );
  await db.insert(schema.messages).values({
    conversationId: args.conversationId,
    senderType: 'bot',
    contentType: 'text',
    contentText: args.text,
    messageId,
    status: 'sent',
    aiGenerated: args.aiGenerated ?? false,
  });
  await updateConversation(args, args.text);
  return { whatsapp_message_id: messageId };
}

export async function engineSendMedia(
  args: SendMediaEngineArgs
): Promise<{ whatsapp_message_id: string }> {
  const messageId = await sendWithPhoneVariants(
    args,
    async (to, credentials) =>
      (
        await sendMediaMessage({
          ...credentials,
          to,
          kind: args.kind,
          link: args.link,
          caption: args.caption,
          filename: args.filename,
        })
      ).messageId
  );
  await db.insert(schema.messages).values({
    conversationId: args.conversationId,
    senderType: 'bot',
    contentType: args.kind,
    contentText: args.caption ?? null,
    messageId,
    status: 'sent',
  });
  await updateConversation(args, args.caption?.trim() || `[${args.kind}]`);
  return { whatsapp_message_id: messageId };
}

export async function engineSendInteractiveButtons(
  args: SendInteractiveButtonsEngineArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendInteractiveViaMeta({ ...args, kind: 'buttons' });
}

export async function engineSendInteractiveList(
  args: SendInteractiveListEngineArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendInteractiveViaMeta({ ...args, kind: 'list' });
}

type SendInput =
  | (SendInteractiveButtonsEngineArgs & { kind: 'buttons' })
  | (SendInteractiveListEngineArgs & { kind: 'list' });

async function sendInteractiveViaMeta(
  input: SendInput
): Promise<{ whatsapp_message_id: string }> {
  const messageId = await sendWithPhoneVariants(
    input,
    async (to, credentials) => {
      if (input.kind === 'buttons') {
        return (
          await sendInteractiveButtons({
            ...credentials,
            to,
            bodyText: input.bodyText,
            buttons: input.buttons,
            headerText: input.headerText,
            footerText: input.footerText,
          })
        ).messageId;
      }
      return (
        await sendInteractiveList({
          ...credentials,
          to,
          bodyText: input.bodyText,
          buttonLabel: input.buttonLabel,
          sections: input.sections,
          headerText: input.headerText,
          footerText: input.footerText,
        })
      ).messageId;
    }
  );

  const interactivePayload: InteractiveMessagePayload =
    input.kind === 'buttons'
      ? {
          kind: 'buttons',
          body: input.bodyText,
          header: input.headerText,
          footer: input.footerText,
          buttons: input.buttons,
        }
      : {
          kind: 'list',
          body: input.bodyText,
          header: input.headerText,
          footer: input.footerText,
          button_label: input.buttonLabel,
          sections: input.sections,
        };
  await db.insert(schema.messages).values({
    conversationId: input.conversationId,
    senderType: 'bot',
    contentType: 'interactive',
    contentText: input.bodyText,
    interactivePayload,
    messageId,
    status: 'sent',
  });
  await updateConversation(input, input.bodyText);
  return { whatsapp_message_id: messageId };
}
