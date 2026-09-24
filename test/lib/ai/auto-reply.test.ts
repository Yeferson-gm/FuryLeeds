import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { hoisted } from '@test/support/mocks';
import type { AiConfig } from '@/lib/ai/types';

const h = hoisted(() => ({
  loadAiConfig: mock(),
  buildConversationContext: mock(),
  retrieveKnowledge: mock(),
  generateReply: mock(),
  engineSendText: mock(),
  sendTypingIndicator: mock(),
  logAiUsage: mock(),
  state: {
    conv: null as Record<string, unknown> | null,
    autoResponders: [] as { id: string }[],
    whatsappConfig: null as Record<string, unknown> | null,
    claim: true,
    updatePayload: null as Record<string, unknown> | null,
    claimCalls: [] as {
      accountId: string;
      conversationId: string;
      maxReplies: number;
    }[],
  },
}));

mock.module('@/lib/ai/config', () => ({ loadAiConfig: h.loadAiConfig }));
mock.module('@/lib/ai/context', () => ({
  buildConversationContext: h.buildConversationContext,
}));
mock.module('@/lib/ai/knowledge', () => ({
  retrieveKnowledge: h.retrieveKnowledge,
}));
mock.module('@/lib/ai/generate', () => ({ generateReply: h.generateReply }));
mock.module('@/lib/ai/usage', () => ({ logAiUsage: h.logAiUsage }));
mock.module('@/lib/flows/meta-send', () => ({
  engineSendText: h.engineSendText,
}));
mock.module('@/lib/whatsapp/meta-api', () => ({
  sendTypingIndicator: h.sendTypingIndicator,
}));

mock.module('@/lib/db', () => {
  const schema = {
    automations: {
      id: 'automations.id',
      accountId: 'automations.accountId',
      isActive: 'automations.isActive',
      triggerType: 'automations.triggerType',
    },
    conversations: {
      id: 'conversations.id',
      accountId: 'conversations.accountId',
      assignedAgentId: 'conversations.assignedAgentId',
      aiAutoreplyDisabled: 'conversations.aiAutoreplyDisabled',
      aiReplyCount: 'conversations.aiReplyCount',
      aiHandoffSummary: 'conversations.aiHandoffSummary',
    },
    whatsappConfig: {
      phoneNumberId: 'whatsappConfig.phoneNumberId',
      accessToken: 'whatsappConfig.accessToken',
      accountId: 'whatsappConfig.accountId',
    },
  };

  const db = {
    select: () => {
      let table: unknown;
      const query = {
        from: (value: unknown) => {
          table = value;
          return query;
        },
        where: () => query,
        limit: () => {
          if (table === schema.automations) {
            return Promise.resolve(h.state.autoResponders);
          }
          if (table === schema.conversations) {
            return Promise.resolve(h.state.conv ? [h.state.conv] : []);
          }
          if (table === schema.whatsappConfig) {
            return Promise.resolve(
              h.state.whatsappConfig ? [h.state.whatsappConfig] : []
            );
          }
          return Promise.resolve([]);
        },
      };
      return query;
    },
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        h.state.updatePayload = payload;
        return { where: () => Promise.resolve() };
      },
    }),
  };

  const sqlClient = (
    _strings: TemplateStringsArray,
    conversationId: string,
    accountId: string,
    maxReplies: number
  ) => {
    h.state.claimCalls.push({ accountId, conversationId, maxReplies });
    return Promise.resolve(h.state.claim ? [{ id: conversationId }] : []);
  };

  return { db, schema, sqlClient };
});

import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply';
import { encrypt } from '@/lib/whatsapp/encryption';

const ARGS = {
  accountId: 'acct-1',
  conversationId: 'conv-1',
  contactId: 'contact-1',
  configOwnerUserId: 'user-1',
  inboundMessageId: 'wamid.inbound-1',
};

function aiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test',
    systemPrompt: null,
    isActive: true,
    autoReplyEnabled: true,
    autoReplyMaxPerConversation: 3,
    handoffAgentId: null,
    embeddingsApiKey: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.state.conv = {
    assignedAgentId: null,
    aiAutoreplyDisabled: false,
    aiReplyCount: 0,
  };
  h.state.autoResponders = [];
  h.state.whatsappConfig = {
    phoneNumberId: 'pn-1',
    accessToken: encrypt('tok'),
  };
  h.state.claim = true;
  h.state.updatePayload = null;
  h.state.claimCalls = [];
  h.loadAiConfig.mockResolvedValue(aiConfig());
  h.buildConversationContext.mockResolvedValue([
    { role: 'user', content: 'hi' },
  ]);
  h.retrieveKnowledge.mockResolvedValue([]);
  h.generateReply.mockResolvedValue({
    text: 'Hello!',
    handoff: false,
    usage: null,
  });
  h.engineSendText.mockResolvedValue({ whatsapp_message_id: 'm1' });
  h.sendTypingIndicator.mockResolvedValue(undefined);
  h.logAiUsage.mockResolvedValue(undefined);
});

describe('dispatchInboundToAiReply — eligibility gates', () => {
  it('claims a slot transactionally and sends on the happy path', async () => {
    await dispatchInboundToAiReply(ARGS);
    expect(h.state.claimCalls).toEqual([
      { accountId: 'acct-1', conversationId: 'conv-1', maxReplies: 3 },
    ]);
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', text: 'Hello!' })
    );
  });

  it('grounds the reply in retrieved knowledge', async () => {
    h.retrieveKnowledge.mockResolvedValue(['Returns accepted within 30 days.']);
    await dispatchInboundToAiReply(ARGS);
    const systemPrompt = h.generateReply.mock.calls[0][0]
      .systemPrompt as string;
    expect(systemPrompt).toContain('Returns accepted within 30 days.');
  });

  it('stands down when an active message-level automation exists', async () => {
    h.state.autoResponders = [{ id: 'auto-1' }];
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.engineSendText).not.toHaveBeenCalled();
    expect(h.sendTypingIndicator).not.toHaveBeenCalled();
  });

  it('does not send when the atomic slot claim loses the race', async () => {
    h.state.claim = false;
    await dispatchInboundToAiReply(ARGS);
    expect(h.state.claimCalls).toHaveLength(1);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('skips when AI is off / not configured', async () => {
    h.loadAiConfig.mockResolvedValue(null);
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('skips when auto-reply is disabled for the account', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ autoReplyEnabled: false }));
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('skips when a human agent is assigned', async () => {
    h.state.conv = {
      assignedAgentId: 'agent-9',
      aiAutoreplyDisabled: false,
      aiReplyCount: 0,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
    expect(h.sendTypingIndicator).not.toHaveBeenCalled();
  });

  it('skips when auto-reply was disabled on this conversation', async () => {
    h.state.conv = {
      assignedAgentId: null,
      aiAutoreplyDisabled: true,
      aiReplyCount: 0,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('skips when the per-conversation cap is reached', async () => {
    h.state.conv = {
      assignedAgentId: null,
      aiAutoreplyDisabled: false,
      aiReplyCount: 3,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('skips when there is nothing to reply to', async () => {
    h.buildConversationContext.mockResolvedValue([]);
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.engineSendText).not.toHaveBeenCalled();
    expect(h.sendTypingIndicator).not.toHaveBeenCalled();
  });
});

describe('dispatchInboundToAiReply — typing indicator', () => {
  it('shows typing before calling the LLM', async () => {
    await dispatchInboundToAiReply(ARGS);
    expect(h.sendTypingIndicator).toHaveBeenCalledWith({
      phoneNumberId: 'pn-1',
      accessToken: 'tok',
      messageId: 'wamid.inbound-1',
    });
    expect(h.sendTypingIndicator.mock.invocationCallOrder[0]).toBeLessThan(
      h.generateReply.mock.invocationCallOrder[0]
    );
    expect(h.engineSendText).toHaveBeenCalledTimes(1);
  });

  it('still sends the reply when the indicator request fails', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    h.sendTypingIndicator.mockRejectedValue(new Error('Meta API error: 400'));
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('typing indicator failed'),
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('still sends when WhatsApp credentials are absent', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    h.state.whatsappConfig = null;
    await dispatchInboundToAiReply(ARGS);
    expect(h.sendTypingIndicator).not.toHaveBeenCalled();
    expect(h.engineSendText).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('dispatchInboundToAiReply — handoff', () => {
  it('disables auto-reply, writes a summary, and does not send', async () => {
    h.generateReply.mockResolvedValue({ text: '', handoff: true, usage: null });
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
    expect(h.state.claimCalls).toHaveLength(0);
    expect(h.state.updatePayload).toMatchObject({ aiAutoreplyDisabled: true });
    expect(h.state.updatePayload?.aiHandoffSummary).toContain(
      'AI agent handed off'
    );
    expect(h.state.updatePayload).not.toHaveProperty('assignedAgentId');
  });

  it('routes to the configured handoff agent', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ handoffAgentId: 'agent-7' }));
    h.generateReply.mockResolvedValue({ text: '', handoff: true, usage: null });
    await dispatchInboundToAiReply(ARGS);
    expect(h.state.updatePayload).toMatchObject({
      aiAutoreplyDisabled: true,
      assignedAgentId: 'agent-7',
    });
  });
});
