import { and, asc, eq, sql } from 'drizzle-orm';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { type db as appDb, schema } from '@/lib/db';
import { findExistingContact, isUniqueViolation } from '@/lib/whatsapp/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  type InteractiveMessagePayload,
  interactivePayloadPreviewText,
  validateInteractivePayload,
} from '@/lib/whatsapp/interactive';
import {
  type MediaKind,
  sendInteractiveButtons,
  sendInteractiveList,
  sendMediaMessage,
  sendTemplateMessage,
  sendTextMessage,
} from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  parseInternationalPhone,
  phoneVariants,
} from '@/lib/whatsapp/phone-utils';
import {
  resolveTemplateRow,
  templateBodyParams,
  templateContentText,
} from '@/lib/whatsapp/template-body';
import { resolveContactSendTarget } from '@/lib/whatsapp/wa-identity';

const MEDIA_KINDS = ['image', 'video', 'document', 'audio'] as const;
const VALID_MESSAGE_TYPES = [
  'text',
  'template',
  'interactive',
  ...MEDIA_KINDS,
] as const;

export class SendMessageError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SendMessageError';
    this.code = code;
    this.status = status;
  }
}

export interface SendMessageParams {
  conversationId: string;
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParams?: string[];
  templateMessageParams?: unknown;
  interactivePayload?: InteractiveMessagePayload | null;
  replyToMessageId?: string | null;
}

export function validateSendMessageParams(params: {
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  templateName?: string | null;
  interactivePayload?: InteractiveMessagePayload | null;
}): void {
  const {
    messageType,
    contentText,
    mediaUrl,
    templateName,
    interactivePayload,
  } = params;
  if (!(VALID_MESSAGE_TYPES as readonly string[]).includes(messageType)) {
    throw new SendMessageError(
      'bad_request',
      `Unsupported message_type "${messageType}"`,
      400
    );
  }
  if (messageType === 'text' && !contentText) {
    throw new SendMessageError(
      'bad_request',
      'content_text is required for text messages',
      400
    );
  }
  if (messageType === 'template' && !templateName) {
    throw new SendMessageError(
      'bad_request',
      'template_name is required for template messages',
      400
    );
  }
  if (messageType === 'interactive') {
    const validation = validateInteractivePayload(interactivePayload);
    if (!validation.ok) {
      throw new SendMessageError('bad_request', validation.error, 400);
    }
  }
  const isMedia = (MEDIA_KINDS as readonly string[]).includes(messageType);
  if (isMedia && !mediaUrl) {
    throw new SendMessageError(
      'bad_request',
      `media_url is required for ${messageType} messages`,
      400
    );
  }
  if (
    isMedia &&
    messageType !== 'audio' &&
    typeof contentText === 'string' &&
    contentText.length > 1024
  ) {
    throw new SendMessageError(
      'bad_request',
      'Caption exceeds the 1024-character limit',
      400
    );
  }
}

export async function resolveConversationByPhone(
  database: typeof appDb,
  accountId: string,
  phone: string,
  name?: string | null
): Promise<{
  conversationId: string;
  contactId: string;
  contactCreated: boolean;
}> {
  const sanitized = parseInternationalPhone(phone);
  if (!sanitized) {
    throw new SendMessageError(
      'bad_request',
      "'to' must be an international phone number with a leading + and country code (e.g. +14155550123)",
      400
    );
  }
  const [config] = await database
    .select({ id: schema.whatsappConfig.id })
    .from(schema.whatsappConfig)
    .where(eq(schema.whatsappConfig.accountId, accountId))
    .limit(1);
  if (!config) {
    throw new SendMessageError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }

  try {
    return await database.transaction(async (tx) => {
      const [auditUserId, foundContact] = await Promise.all([
        resolveAuditUserId(tx, accountId),
        findExistingContact(tx, accountId, sanitized),
      ]);
      let existing = foundContact;
      let contactId: string;
      let contactCreated = false;
      if (existing) {
        contactId = existing.id;
        if (name && name !== existing.name) {
          await tx
            .update(schema.contacts)
            .set({ name, updatedAt: sql`now()` })
            .where(
              and(
                eq(schema.contacts.id, contactId),
                eq(schema.contacts.accountId, accountId)
              )
            );
        }
      } else {
        try {
          const [created] = await tx
            .insert(schema.contacts)
            .values({
              accountId,
              userId: auditUserId,
              phone: sanitized,
              name: name || sanitized,
            })
            .returning({ id: schema.contacts.id });
          if (!created) throw new Error('Contact insert returned no row');
          contactId = created.id;
          contactCreated = true;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          existing = await findExistingContact(tx, accountId, sanitized);
          if (!existing) throw error;
          contactId = existing.id;
        }
      }

      const [conversation] = await tx
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.accountId, accountId),
            eq(schema.conversations.contactId, contactId)
          )
        )
        .orderBy(asc(schema.conversations.createdAt))
        .limit(1);
      if (conversation) {
        return { conversationId: conversation.id, contactId, contactCreated };
      }
      try {
        const [created] = await tx
          .insert(schema.conversations)
          .values({ accountId, userId: auditUserId, contactId })
          .returning({ id: schema.conversations.id });
        if (!created) throw new Error('Conversation insert returned no row');
        return { conversationId: created.id, contactId, contactCreated };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const [raced] = await tx
          .select({ id: schema.conversations.id })
          .from(schema.conversations)
          .where(
            and(
              eq(schema.conversations.accountId, accountId),
              eq(schema.conversations.contactId, contactId)
            )
          )
          .orderBy(asc(schema.conversations.createdAt))
          .limit(1);
        if (!raced) throw error;
        return { conversationId: raced.id, contactId, contactCreated };
      }
    });
  } catch (error) {
    if (error instanceof SendMessageError) throw error;
    console.error('[api/v1/messages] conversation resolution failed:', error);
    throw new SendMessageError(
      'db_error',
      'Failed to resolve conversation',
      500
    );
  }
}

export async function sendMessageToConversation(
  database: typeof appDb,
  accountId: string,
  params: SendMessageParams
): Promise<{ messageId: string; whatsappMessageId: string }> {
  validateSendMessageParams(params);
  const [record] = await database
    .select({
      conversationId: schema.conversations.id,
      contactId: schema.contacts.id,
      phone: schema.contacts.phone,
      waUserId: schema.contacts.waUserId,
    })
    .from(schema.conversations)
    .innerJoin(
      schema.contacts,
      and(
        eq(schema.contacts.id, schema.conversations.contactId),
        eq(schema.contacts.accountId, accountId)
      )
    )
    .where(
      and(
        eq(schema.conversations.id, params.conversationId),
        eq(schema.conversations.accountId, accountId)
      )
    )
    .limit(1);
  if (!record)
    throw new SendMessageError('not_found', 'Conversation not found', 404);

  const target = resolveContactSendTarget({
    phone: record.phone,
    wa_user_id: record.waUserId,
  });
  if (!target) {
    throw new SendMessageError(
      'bad_request',
      record.phone
        ? 'Invalid phone number format'
        : 'Contact has no phone number or WhatsApp user ID',
      400
    );
  }

  const [config] = await database
    .select()
    .from(schema.whatsappConfig)
    .where(eq(schema.whatsappConfig.accountId, accountId))
    .limit(1);
  if (!config) {
    throw new SendMessageError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }
  const accessToken = decrypt(config.accessToken);

  let contextMessageId: string | undefined;
  if (params.replyToMessageId) {
    const [parent] = await database
      .select({ messageId: schema.messages.messageId })
      .from(schema.messages)
      .innerJoin(
        schema.conversations,
        and(
          eq(schema.conversations.id, schema.messages.conversationId),
          eq(schema.conversations.accountId, accountId)
        )
      )
      .where(
        and(
          eq(schema.messages.id, params.replyToMessageId),
          eq(schema.messages.conversationId, params.conversationId)
        )
      )
      .limit(1);
    if (!parent) {
      throw new SendMessageError(
        'bad_request',
        'reply_to_message_id not found in this conversation',
        400
      );
    }
    contextMessageId = parent.messageId ?? undefined;
  }

  let templateRow = null;
  let sendLanguage = params.templateLanguage || 'en_US';
  if (params.messageType === 'template' && params.templateName) {
    const resolved = await resolveTemplateRow(
      database,
      accountId,
      params.templateName,
      params.templateLanguage
    );
    if (resolved.malformed) {
      throw new SendMessageError(
        'template_malformed',
        'Template row is malformed locally — run "Sync from Meta" in Settings to repair it.',
        500
      );
    }
    templateRow = resolved.row;
    sendLanguage = resolved.language;
  }

  const attempt = async (recipient: string): Promise<string> => {
    if (params.messageType === 'template' && params.templateName) {
      return (
        await sendTemplateMessage({
          phoneNumberId: config.phoneNumberId,
          accessToken,
          to: recipient,
          templateName: params.templateName,
          language: sendLanguage,
          template: templateRow ?? undefined,
          messageParams: params.templateMessageParams ?? undefined,
          bodyParams: params.templateParams ?? [],
          contextMessageId,
        })
      ).messageId;
    }
    if ((MEDIA_KINDS as readonly string[]).includes(params.messageType)) {
      return (
        await sendMediaMessage({
          phoneNumberId: config.phoneNumberId,
          accessToken,
          to: recipient,
          kind: params.messageType as MediaKind,
          link: params.mediaUrl as string,
          caption: params.contentText || undefined,
          filename: params.filename || undefined,
          contextMessageId,
        })
      ).messageId;
    }
    if (params.messageType === 'interactive' && params.interactivePayload) {
      const payload = params.interactivePayload;
      if (payload.kind === 'buttons') {
        return (
          await sendInteractiveButtons({
            phoneNumberId: config.phoneNumberId,
            accessToken,
            to: recipient,
            bodyText: payload.body,
            headerText: payload.header || undefined,
            footerText: payload.footer || undefined,
            buttons: payload.buttons,
            contextMessageId,
          })
        ).messageId;
      }
      return (
        await sendInteractiveList({
          phoneNumberId: config.phoneNumberId,
          accessToken,
          to: recipient,
          bodyText: payload.body,
          buttonLabel: payload.button_label,
          headerText: payload.header || undefined,
          footerText: payload.footer || undefined,
          sections: payload.sections,
          contextMessageId,
        })
      ).messageId;
    }
    return (
      await sendTextMessage({
        phoneNumberId: config.phoneNumberId,
        accessToken,
        to: recipient,
        text: params.contentText as string,
        contextMessageId,
      })
    ).messageId;
  };

  let whatsappMessageId = '';
  let workingTarget = target.target;
  try {
    const variants = target.isPhone
      ? phoneVariants(target.target)
      : [target.target];
    let lastError: unknown = null;
    for (const variant of variants) {
      try {
        whatsappMessageId = await attempt(variant);
        workingTarget = variant;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!isRecipientNotAllowedError(message)) throw error;
      }
    }
    if (lastError) throw lastError;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Meta API error';
    throw new SendMessageError('meta_error', `Meta API error: ${message}`, 502);
  }

  let persistedText: string | null;
  if (params.messageType === 'interactive') {
    persistedText = params.interactivePayload?.body ?? null;
  } else if (params.messageType === 'template') {
    persistedText = templateContentText(
      templateRow,
      templateBodyParams(params.templateParams, params.templateMessageParams),
      params.contentText
    );
  } else {
    persistedText = params.contentText ?? null;
  }
  const lastMessageText =
    params.messageType === 'interactive' && params.interactivePayload
      ? interactivePayloadPreviewText(params.interactivePayload)
      : persistedText || `[${params.messageType}]`;

  try {
    return await database.transaction(async (tx) => {
      if (target.isPhone && workingTarget !== target.target) {
        await tx
          .update(schema.contacts)
          .set({ phone: workingTarget, updatedAt: sql`now()` })
          .where(
            and(
              eq(schema.contacts.id, record.contactId),
              eq(schema.contacts.accountId, accountId)
            )
          );
      }
      const [message] = await tx
        .insert(schema.messages)
        .values({
          conversationId: params.conversationId,
          senderType: 'agent',
          contentType: params.messageType,
          contentText: persistedText,
          mediaUrl: params.mediaUrl || null,
          templateName: params.templateName || null,
          interactivePayload:
            params.messageType === 'interactive'
              ? params.interactivePayload
              : null,
          messageId: whatsappMessageId,
          status: 'sent',
          replyToMessageId: params.replyToMessageId || null,
        })
        .returning({ id: schema.messages.id });
      if (!message) throw new Error('Message insert returned no row');
      await tx
        .update(schema.conversations)
        .set({
          lastMessageText,
          lastMessageAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(schema.conversations.id, params.conversationId),
            eq(schema.conversations.accountId, accountId)
          )
        );
      await tx
        .update(schema.flowRuns)
        .set({
          status: 'paused_by_agent',
          endedAt: sql`now()`,
          endReason: 'agent_replied',
        })
        .where(
          and(
            eq(schema.flowRuns.accountId, accountId),
            eq(schema.flowRuns.contactId, record.contactId),
            eq(schema.flowRuns.status, 'active')
          )
        );
      return { messageId: message.id, whatsappMessageId };
    });
  } catch (error) {
    console.error('[api/v1/messages] post-send persistence failed:', error);
    throw new SendMessageError(
      'db_error',
      'Message sent to Meta but failed to save to DB',
      500
    );
  }
}
