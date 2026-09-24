import { relations } from 'drizzle-orm/relations';
import {
  accountInvitations,
  accounts,
  aiConfigs,
  aiKnowledgeChunks,
  aiKnowledgeDocuments,
  aiUsageLog,
  apiKeys,
  automationLogs,
  automationPendingExecutions,
  automationSteps,
  automations,
  broadcastRecipients,
  broadcasts,
  contactCustomValues,
  contactNotes,
  contacts,
  contactTags,
  conversations,
  customFields,
  deals,
  flowNodes,
  flowRunEvents,
  flowRuns,
  flows,
  memberPresence,
  messageReactions,
  messages,
  messageTemplates,
  notifications,
  pipelineStages,
  pipelines,
  profiles,
  quickReplies,
  tags,
  webhookEndpoints,
  whatsappConfig,
} from './crm-schema';

export const whatsappConfigRelations = relations(whatsappConfig, ({ one }) => ({
  account: one(accounts, {
    fields: [whatsappConfig.accountId],
    references: [accounts.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  whatsappConfigs: many(whatsappConfig),
  aiKnowledgeChunks: many(aiKnowledgeChunks),
  aiKnowledgeDocuments: many(aiKnowledgeDocuments),
  automationPendingExecutions: many(automationPendingExecutions),
  customFields: many(customFields),
  aiConfigs: many(aiConfigs),
  apiKeys: many(apiKeys),
  pipelines: many(pipelines),
  conversations: many(conversations),
  profiles: many(profiles),
  aiUsageLogs: many(aiUsageLog),
  tags: many(tags),
  contacts: many(contacts),
  accountInvitations: many(accountInvitations),
  automations: many(automations),
  broadcasts: many(broadcasts),
  contactNotes: many(contactNotes),
  automationLogs: many(automationLogs),
  notifications: many(notifications),
  messageTemplates: many(messageTemplates),
  flowRuns: many(flowRuns),
  deals: many(deals),
  flows: many(flows),
  memberPresences: many(memberPresence),
  quickReplies: many(quickReplies),
  webhookEndpoints: many(webhookEndpoints),
}));

export const aiKnowledgeChunksRelations = relations(
  aiKnowledgeChunks,
  ({ one }) => ({
    account: one(accounts, {
      fields: [aiKnowledgeChunks.accountId],
      references: [accounts.id],
    }),
    aiKnowledgeDocument: one(aiKnowledgeDocuments, {
      fields: [aiKnowledgeChunks.documentId],
      references: [aiKnowledgeDocuments.id],
    }),
  })
);

export const aiKnowledgeDocumentsRelations = relations(
  aiKnowledgeDocuments,
  ({ one, many }) => ({
    aiKnowledgeChunks: many(aiKnowledgeChunks),
    account: one(accounts, {
      fields: [aiKnowledgeDocuments.accountId],
      references: [accounts.id],
    }),
  })
);

export const automationPendingExecutionsRelations = relations(
  automationPendingExecutions,
  ({ one }) => ({
    account: one(accounts, {
      fields: [automationPendingExecutions.accountId],
      references: [accounts.id],
    }),
    automation: one(automations, {
      fields: [automationPendingExecutions.automationId],
      references: [automations.id],
    }),
    contact: one(contacts, {
      fields: [automationPendingExecutions.contactId],
      references: [contacts.id],
    }),
    automationLog: one(automationLogs, {
      fields: [automationPendingExecutions.logId],
      references: [automationLogs.id],
    }),
    automationStep: one(automationSteps, {
      fields: [automationPendingExecutions.parentStepId],
      references: [automationSteps.id],
    }),
  })
);

export const automationsRelations = relations(automations, ({ one, many }) => ({
  automationPendingExecutions: many(automationPendingExecutions),
  automationSteps: many(automationSteps),
  account: one(accounts, {
    fields: [automations.accountId],
    references: [accounts.id],
  }),
  automationLogs: many(automationLogs),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  automationPendingExecutions: many(automationPendingExecutions),
  conversations: many(conversations),
  broadcastRecipients: many(broadcastRecipients),
  contactCustomValues: many(contactCustomValues),
  contactTags: many(contactTags),
  account: one(accounts, {
    fields: [contacts.accountId],
    references: [accounts.id],
  }),
  contactNotes: many(contactNotes),
  automationLogs: many(automationLogs),
  notifications: many(notifications),
  flowRuns: many(flowRuns),
  deals: many(deals),
}));

export const automationLogsRelations = relations(
  automationLogs,
  ({ one, many }) => ({
    automationPendingExecutions: many(automationPendingExecutions),
    account: one(accounts, {
      fields: [automationLogs.accountId],
      references: [accounts.id],
    }),
    automation: one(automations, {
      fields: [automationLogs.automationId],
      references: [automations.id],
    }),
    contact: one(contacts, {
      fields: [automationLogs.contactId],
      references: [contacts.id],
    }),
  })
);

export const automationStepsRelations = relations(
  automationSteps,
  ({ one, many }) => ({
    automationPendingExecutions: many(automationPendingExecutions),
    automation: one(automations, {
      fields: [automationSteps.automationId],
      references: [automations.id],
    }),
    automationStep: one(automationSteps, {
      fields: [automationSteps.parentStepId],
      references: [automationSteps.id],
      relationName: 'automationSteps_parentStepId_automationSteps_id',
    }),
    automationSteps: many(automationSteps, {
      relationName: 'automationSteps_parentStepId_automationSteps_id',
    }),
  })
);

export const customFieldsRelations = relations(
  customFields,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [customFields.accountId],
      references: [accounts.id],
    }),
    contactCustomValues: many(contactCustomValues),
  })
);

export const messageReactionsRelations = relations(
  messageReactions,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [messageReactions.conversationId],
      references: [conversations.id],
    }),
    message: one(messages, {
      fields: [messageReactions.messageId],
      references: [messages.id],
    }),
  })
);

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    messageReactions: many(messageReactions),
    messages: many(messages),
    account: one(accounts, {
      fields: [conversations.accountId],
      references: [accounts.id],
    }),
    contact: one(contacts, {
      fields: [conversations.contactId],
      references: [contacts.id],
    }),
    aiUsageLogs: many(aiUsageLog),
    notifications: many(notifications),
    flowRuns: many(flowRuns),
    deals: many(deals),
  })
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  messageReactions: many(messageReactions),
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, {
    fields: [messages.replyToMessageId],
    references: [messages.id],
    relationName: 'messages_replyToMessageId_messages_id',
  }),
  messages: many(messages, {
    relationName: 'messages_replyToMessageId_messages_id',
  }),
  flowRuns: many(flowRuns),
}));

export const aiConfigsRelations = relations(aiConfigs, ({ one }) => ({
  account: one(accounts, {
    fields: [aiConfigs.accountId],
    references: [accounts.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  account: one(accounts, {
    fields: [apiKeys.accountId],
    references: [accounts.id],
  }),
}));

export const pipelinesRelations = relations(pipelines, ({ one, many }) => ({
  account: one(accounts, {
    fields: [pipelines.accountId],
    references: [accounts.id],
  }),
  pipelineStages: many(pipelineStages),
  deals: many(deals),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  account: one(accounts, {
    fields: [profiles.accountId],
    references: [accounts.id],
  }),
  deals: many(deals),
}));

export const broadcastRecipientsRelations = relations(
  broadcastRecipients,
  ({ one }) => ({
    broadcast: one(broadcasts, {
      fields: [broadcastRecipients.broadcastId],
      references: [broadcasts.id],
    }),
    contact: one(contacts, {
      fields: [broadcastRecipients.contactId],
      references: [contacts.id],
    }),
  })
);

export const broadcastsRelations = relations(broadcasts, ({ one, many }) => ({
  broadcastRecipients: many(broadcastRecipients),
  account: one(accounts, {
    fields: [broadcasts.accountId],
    references: [accounts.id],
  }),
}));

export const contactCustomValuesRelations = relations(
  contactCustomValues,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [contactCustomValues.contactId],
      references: [contacts.id],
    }),
    customField: one(customFields, {
      fields: [contactCustomValues.customFieldId],
      references: [customFields.id],
    }),
  })
);

export const flowRunEventsRelations = relations(flowRunEvents, ({ one }) => ({
  flowRun: one(flowRuns, {
    fields: [flowRunEvents.flowRunId],
    references: [flowRuns.id],
  }),
}));

export const flowRunsRelations = relations(flowRuns, ({ one, many }) => ({
  flowRunEvents: many(flowRunEvents),
  account: one(accounts, {
    fields: [flowRuns.accountId],
    references: [accounts.id],
  }),
  contact: one(contacts, {
    fields: [flowRuns.contactId],
    references: [contacts.id],
  }),
  conversation: one(conversations, {
    fields: [flowRuns.conversationId],
    references: [conversations.id],
  }),
  flow: one(flows, {
    fields: [flowRuns.flowId],
    references: [flows.id],
  }),
  message: one(messages, {
    fields: [flowRuns.lastPromptMessageId],
    references: [messages.id],
  }),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactTags.contactId],
    references: [contacts.id],
  }),
  tag: one(tags, {
    fields: [contactTags.tagId],
    references: [tags.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  contactTags: many(contactTags),
  account: one(accounts, {
    fields: [tags.accountId],
    references: [accounts.id],
  }),
}));

export const aiUsageLogRelations = relations(aiUsageLog, ({ one }) => ({
  account: one(accounts, {
    fields: [aiUsageLog.accountId],
    references: [accounts.id],
  }),
  conversation: one(conversations, {
    fields: [aiUsageLog.conversationId],
    references: [conversations.id],
  }),
}));

export const pipelineStagesRelations = relations(
  pipelineStages,
  ({ one, many }) => ({
    pipeline: one(pipelines, {
      fields: [pipelineStages.pipelineId],
      references: [pipelines.id],
    }),
    deals: many(deals),
  })
);

export const flowNodesRelations = relations(flowNodes, ({ one }) => ({
  flow: one(flows, {
    fields: [flowNodes.flowId],
    references: [flows.id],
  }),
}));

export const flowsRelations = relations(flows, ({ one, many }) => ({
  flowNodes: many(flowNodes),
  flowRuns: many(flowRuns),
  account: one(accounts, {
    fields: [flows.accountId],
    references: [accounts.id],
  }),
}));

export const accountInvitationsRelations = relations(
  accountInvitations,
  ({ one }) => ({
    account: one(accounts, {
      fields: [accountInvitations.accountId],
      references: [accounts.id],
    }),
  })
);

export const contactNotesRelations = relations(contactNotes, ({ one }) => ({
  account: one(accounts, {
    fields: [contactNotes.accountId],
    references: [accounts.id],
  }),
  contact: one(contacts, {
    fields: [contactNotes.contactId],
    references: [contacts.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  account: one(accounts, {
    fields: [notifications.accountId],
    references: [accounts.id],
  }),
  contact: one(contacts, {
    fields: [notifications.contactId],
    references: [contacts.id],
  }),
  conversation: one(conversations, {
    fields: [notifications.conversationId],
    references: [conversations.id],
  }),
}));

export const messageTemplatesRelations = relations(
  messageTemplates,
  ({ one }) => ({
    account: one(accounts, {
      fields: [messageTemplates.accountId],
      references: [accounts.id],
    }),
  })
);

export const dealsRelations = relations(deals, ({ one }) => ({
  account: one(accounts, {
    fields: [deals.accountId],
    references: [accounts.id],
  }),
  profile: one(profiles, {
    fields: [deals.assignedTo],
    references: [profiles.id],
  }),
  contact: one(contacts, {
    fields: [deals.contactId],
    references: [contacts.id],
  }),
  conversation: one(conversations, {
    fields: [deals.conversationId],
    references: [conversations.id],
  }),
  pipeline: one(pipelines, {
    fields: [deals.pipelineId],
    references: [pipelines.id],
  }),
  pipelineStage: one(pipelineStages, {
    fields: [deals.stageId],
    references: [pipelineStages.id],
  }),
}));

export const memberPresenceRelations = relations(memberPresence, ({ one }) => ({
  account: one(accounts, {
    fields: [memberPresence.accountId],
    references: [accounts.id],
  }),
}));

export const quickRepliesRelations = relations(quickReplies, ({ one }) => ({
  account: one(accounts, {
    fields: [quickReplies.accountId],
    references: [accounts.id],
  }),
}));

export const webhookEndpointsRelations = relations(
  webhookEndpoints,
  ({ one }) => ({
    account: one(accounts, {
      fields: [webhookEndpoints.accountId],
      references: [accounts.id],
    }),
  })
);
