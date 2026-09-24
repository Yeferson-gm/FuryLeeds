import { and, eq, inArray } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/lib/db';
import { engineSendText } from '@/lib/flows/meta-send';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTypingIndicator } from '@/lib/whatsapp/meta-api';
import { loadAiConfig } from './config';
import { buildConversationContext } from './context';
import { buildSystemPrompt } from './defaults';
import { generateReply } from './generate';
import { buildHandoffSummary } from './handoff';
import { retrieveKnowledge } from './knowledge';
import { latestUserMessage } from './query';
import { logAiUsage } from './usage';

interface DispatchArgs {
  accountId: string;
  conversationId: string;
  contactId: string;
  configOwnerUserId: string;
  inboundMessageId: string;
}

/** Atomically reserve one auto-reply under the conversation cap. */
export async function claimAiReplySlot(
  accountId: string,
  conversationId: string,
  maxReplies: number
): Promise<boolean> {
  const rows = (await sqlClient`
    UPDATE conversations
    SET ai_reply_count = ai_reply_count + 1
    WHERE id = ${conversationId}
      AND account_id = ${accountId}
      AND ai_reply_count < ${maxReplies}
    RETURNING id
  `) as unknown as { id: string }[];
  return rows.length > 0;
}

/**
 * AI auto-reply for a freshly-arrived inbound message. This owns its
 * error boundary so provider/database failures never affect the webhook.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs
): Promise<void> {
  const {
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    inboundMessageId,
  } = args;

  try {
    const config = await loadAiConfig(db, accountId);
    if (!config?.autoReplyEnabled) return;

    const [autoResponder] = await db
      .select({ id: schema.automations.id })
      .from(schema.automations)
      .where(
        and(
          eq(schema.automations.accountId, accountId),
          eq(schema.automations.isActive, true),
          inArray(schema.automations.triggerType, [
            'new_message_received',
            'keyword_match',
          ])
        )
      )
      .limit(1);
    if (autoResponder) return;

    const [conversation] = await db
      .select({
        assignedAgentId: schema.conversations.assignedAgentId,
        aiAutoreplyDisabled: schema.conversations.aiAutoreplyDisabled,
        aiReplyCount: schema.conversations.aiReplyCount,
      })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.accountId, accountId)
        )
      )
      .limit(1);
    if (!conversation) return;
    if (conversation.assignedAgentId || conversation.aiAutoreplyDisabled)
      return;
    if (conversation.aiReplyCount >= config.autoReplyMaxPerConversation) return;

    const messages = await buildConversationContext(
      db,
      accountId,
      conversationId
    );
    if (messages.length === 0) return;

    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount
    );
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`
      );
      return;
    }

    await showTypingIndicator(accountId, inboundMessageId);

    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(messages)
    );
    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
    });
    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    });

    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    });

    if (handoff || !text) {
      const summary = buildHandoffSummary({
        messages,
        replyCount: conversation.aiReplyCount,
      });
      await db
        .update(schema.conversations)
        .set({
          aiAutoreplyDisabled: true,
          aiHandoffSummary: summary,
          ...(config.handoffAgentId && !conversation.assignedAgentId
            ? { assignedAgentId: config.handoffAgentId }
            : {}),
        })
        .where(
          and(
            eq(schema.conversations.id, conversationId),
            eq(schema.conversations.accountId, accountId)
          )
        );
      return;
    }

    let claimed: boolean;
    try {
      claimed = await claimAiReplySlot(
        accountId,
        conversationId,
        config.autoReplyMaxPerConversation
      );
    } catch (err) {
      console.error('[ai auto-reply] atomic slot claim failed:', err);
      return;
    }
    if (!claimed) return;

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text,
      aiGenerated: true,
    });
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err);
  }
}

async function showTypingIndicator(
  accountId: string,
  inboundMessageId: string
): Promise<void> {
  try {
    const [config] = await db
      .select({
        phoneNumberId: schema.whatsappConfig.phoneNumberId,
        accessToken: schema.whatsappConfig.accessToken,
      })
      .from(schema.whatsappConfig)
      .where(eq(schema.whatsappConfig.accountId, accountId))
      .limit(1);
    if (!config) throw new Error('WhatsApp not configured for this account');

    await sendTypingIndicator({
      phoneNumberId: config.phoneNumberId,
      accessToken: decrypt(config.accessToken),
      messageId: inboundMessageId,
    });
  } catch (err) {
    console.warn('[ai auto-reply] typing indicator failed (continuing):', err);
  }
}
