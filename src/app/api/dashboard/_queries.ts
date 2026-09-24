import { and, asc, desc, eq, gte } from 'drizzle-orm';
import {
  daysAgoStart,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
} from '@/lib/dashboard/date-utils';
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  PipelineStageSlice,
  ResponseTimeBucket,
  ResponseTimeSummary,
} from '@/lib/dashboard/types';
import { type db, schema } from '@/lib/db';

type Database = typeof db;

function numericValue(value: string | number | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function queryMetrics(
  database: Database,
  accountId: string
): Promise<MetricsBundle> {
  const todayStart = daysAgoStart(0).toISOString();
  const yesterdayStart = daysAgoStart(1).toISOString();

  const [conversationRows, contactRows, openDeals, messageRows] =
    await Promise.all([
      database
        .select({
          status: schema.conversations.status,
          createdAt: schema.conversations.createdAt,
        })
        .from(schema.conversations)
        .where(eq(schema.conversations.accountId, accountId)),
      database
        .select({ createdAt: schema.contacts.createdAt })
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.accountId, accountId),
            gte(schema.contacts.createdAt, yesterdayStart)
          )
        ),
      database
        .select({ value: schema.deals.value })
        .from(schema.deals)
        .where(
          and(
            eq(schema.deals.accountId, accountId),
            eq(schema.deals.status, 'open')
          )
        ),
      database
        .select({ createdAt: schema.messages.createdAt })
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
            eq(schema.messages.senderType, 'agent'),
            gte(schema.messages.createdAt, yesterdayStart)
          )
        ),
    ]);

  const openConversations = conversationRows.filter(
    (row) => row.status === 'open'
  );
  const newOpenToday = openConversations.filter(
    (row) => row.createdAt && row.createdAt >= todayStart
  ).length;
  const newOpenYesterday = openConversations.filter(
    (row) =>
      row.createdAt &&
      row.createdAt >= yesterdayStart &&
      row.createdAt < todayStart
  ).length;
  const contactsToday = contactRows.filter(
    (row) => row.createdAt && row.createdAt >= todayStart
  ).length;
  const contactsYesterday = contactRows.filter(
    (row) => row.createdAt && row.createdAt < todayStart
  ).length;
  const messagesToday = messageRows.filter(
    (row) => row.createdAt && row.createdAt >= todayStart
  ).length;
  const messagesYesterday = messageRows.filter(
    (row) => row.createdAt && row.createdAt < todayStart
  ).length;

  return {
    activeConversations: {
      current: openConversations.length,
      previous: newOpenToday - newOpenYesterday,
    },
    newContactsToday: {
      current: contactsToday,
      previous: contactsYesterday,
    },
    openDealsValue: openDeals.reduce(
      (total, deal) => total + numericValue(deal.value),
      0
    ),
    openDealsCount: openDeals.length,
    messagesSentToday: {
      current: messagesToday,
      previous: messagesYesterday,
    },
  };
}

export async function queryConversationsSeries(
  database: Database,
  accountId: string,
  rangeDays: number
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString();
  const rows = await database
    .select({
      createdAt: schema.messages.createdAt,
      senderType: schema.messages.senderType,
    })
    .from(schema.messages)
    .innerJoin(
      schema.conversations,
      and(
        eq(schema.conversations.id, schema.messages.conversationId),
        eq(schema.conversations.accountId, accountId)
      )
    )
    .where(gte(schema.messages.createdAt, start))
    .orderBy(asc(schema.messages.createdAt));

  const keys = lastNDayKeys(rangeDays);
  const buckets = new Map<string, { incoming: number; outgoing: number }>();
  for (const key of keys) buckets.set(key, { incoming: 0, outgoing: 0 });

  for (const row of rows) {
    if (!row.createdAt) continue;
    const bucket = buckets.get(localDayKey(row.createdAt));
    if (!bucket) continue;
    if (row.senderType === 'customer') bucket.incoming += 1;
    else bucket.outgoing += 1;
  }

  return keys.map((day) => ({
    day,
    ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }),
  }));
}

export async function queryPipelineDonut(
  database: Database,
  accountId: string
): Promise<PipelineDonutData> {
  const [stages, deals] = await Promise.all([
    database
      .select({
        id: schema.pipelineStages.id,
        name: schema.pipelineStages.name,
        color: schema.pipelineStages.color,
      })
      .from(schema.pipelineStages)
      .innerJoin(
        schema.pipelines,
        and(
          eq(schema.pipelines.id, schema.pipelineStages.pipelineId),
          eq(schema.pipelines.accountId, accountId)
        )
      )
      .orderBy(asc(schema.pipelineStages.position)),
    database
      .select({
        stageId: schema.deals.stageId,
        value: schema.deals.value,
      })
      .from(schema.deals)
      .where(
        and(
          eq(schema.deals.accountId, accountId),
          eq(schema.deals.status, 'open')
        )
      ),
  ]);

  const byStage = new Map<string, { count: number; total: number }>();
  for (const deal of deals) {
    const aggregate = byStage.get(deal.stageId) ?? { count: 0, total: 0 };
    aggregate.count += 1;
    aggregate.total += numericValue(deal.value);
    byStage.set(deal.stageId, aggregate);
  }

  const slices: PipelineStageSlice[] = stages
    .map((stage) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color || '#64748b',
      dealCount: byStage.get(stage.id)?.count ?? 0,
      totalValue: byStage.get(stage.id)?.total ?? 0,
    }))
    .filter((stage) => stage.totalValue > 0 || stage.dealCount > 0);

  return {
    stages: slices,
    totalValue: slices.reduce((total, stage) => total + stage.totalValue, 0),
  };
}

export async function queryResponseTime(
  database: Database,
  accountId: string
): Promise<ResponseTimeSummary> {
  const fourteenDaysAgo = daysAgoStart(13).toISOString();
  const rows = await database
    .select({
      conversationId: schema.messages.conversationId,
      senderType: schema.messages.senderType,
      createdAt: schema.messages.createdAt,
    })
    .from(schema.messages)
    .innerJoin(
      schema.conversations,
      and(
        eq(schema.conversations.id, schema.messages.conversationId),
        eq(schema.conversations.accountId, accountId)
      )
    )
    .where(gte(schema.messages.createdAt, fourteenDaysAgo))
    .orderBy(
      asc(schema.messages.conversationId),
      asc(schema.messages.createdAt)
    );

  const samples: Array<{ customerAt: Date; responseAt: Date }> = [];
  let currentConversation = '';
  let pendingCustomer: Date | null = null;

  for (const row of rows) {
    if (!row.createdAt) continue;
    if (row.conversationId !== currentConversation) {
      currentConversation = row.conversationId;
      pendingCustomer = null;
    }
    const timestamp = new Date(row.createdAt);
    if (row.senderType === 'customer') {
      pendingCustomer ??= timestamp;
    } else if (pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: timestamp });
      pendingCustomer = null;
    }
  }

  const now = new Date();
  const thisWeekStart = daysAgoStart(mondayIndex(now));
  const lastWeekStart = daysAgoStart(mondayIndex(now) + 7);
  const byDay = new Map<number, number[]>();
  for (let day = 0; day < 7; day += 1) byDay.set(day, []);
  const thisWeekMinutes: number[] = [];
  const lastWeekMinutes: number[] = [];

  for (const sample of samples) {
    const minutes =
      (sample.responseAt.getTime() - sample.customerAt.getTime()) / 60_000;
    if (minutes < 0) continue;
    byDay.get(mondayIndex(sample.customerAt))?.push(minutes);
    if (sample.customerAt >= thisWeekStart) thisWeekMinutes.push(minutes);
    else if (sample.customerAt >= lastWeekStart) lastWeekMinutes.push(minutes);
  }

  const average = (values: number[]): number | null =>
    values.length === 0
      ? null
      : values.reduce((total, value) => total + value, 0) / values.length;

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const values = byDay.get(dow) ?? [];
    return { dow, avgMinutes: average(values), samples: values.length };
  });

  return {
    buckets,
    thisWeekAvg: average(thisWeekMinutes),
    lastWeekAvg: average(lastWeekMinutes),
  };
}

export async function queryActivity(
  database: Database,
  accountId: string,
  limit: number
): Promise<ActivityItem[]> {
  const [messages, contacts, deals, broadcasts, automationLogs] =
    await Promise.all([
      database
        .select({
          id: schema.messages.id,
          conversationId: schema.messages.conversationId,
          createdAt: schema.messages.createdAt,
          contactName: schema.contacts.name,
          contactPhone: schema.contacts.phone,
        })
        .from(schema.messages)
        .innerJoin(
          schema.conversations,
          and(
            eq(schema.conversations.id, schema.messages.conversationId),
            eq(schema.conversations.accountId, accountId)
          )
        )
        .innerJoin(
          schema.contacts,
          and(
            eq(schema.contacts.id, schema.conversations.contactId),
            eq(schema.contacts.accountId, accountId)
          )
        )
        .where(eq(schema.messages.senderType, 'customer'))
        .orderBy(desc(schema.messages.createdAt))
        .limit(10),
      database
        .select({
          id: schema.contacts.id,
          name: schema.contacts.name,
          phone: schema.contacts.phone,
          createdAt: schema.contacts.createdAt,
        })
        .from(schema.contacts)
        .where(eq(schema.contacts.accountId, accountId))
        .orderBy(desc(schema.contacts.createdAt))
        .limit(10),
      database
        .select({
          id: schema.deals.id,
          title: schema.deals.title,
          updatedAt: schema.deals.updatedAt,
          stageName: schema.pipelineStages.name,
        })
        .from(schema.deals)
        .leftJoin(
          schema.pipelines,
          and(
            eq(schema.pipelines.id, schema.deals.pipelineId),
            eq(schema.pipelines.accountId, accountId)
          )
        )
        .leftJoin(
          schema.pipelineStages,
          and(
            eq(schema.pipelineStages.id, schema.deals.stageId),
            eq(schema.pipelineStages.pipelineId, schema.pipelines.id)
          )
        )
        .where(eq(schema.deals.accountId, accountId))
        .orderBy(desc(schema.deals.updatedAt))
        .limit(10),
      database
        .select({
          id: schema.broadcasts.id,
          name: schema.broadcasts.name,
          status: schema.broadcasts.status,
          totalRecipients: schema.broadcasts.totalRecipients,
          createdAt: schema.broadcasts.createdAt,
        })
        .from(schema.broadcasts)
        .where(eq(schema.broadcasts.accountId, accountId))
        .orderBy(desc(schema.broadcasts.createdAt))
        .limit(5),
      database
        .select({
          id: schema.automationLogs.id,
          status: schema.automationLogs.status,
          createdAt: schema.automationLogs.createdAt,
          automationName: schema.automations.name,
          contactName: schema.contacts.name,
          contactPhone: schema.contacts.phone,
        })
        .from(schema.automationLogs)
        .innerJoin(
          schema.automations,
          and(
            eq(schema.automations.id, schema.automationLogs.automationId),
            eq(schema.automations.accountId, accountId)
          )
        )
        .leftJoin(
          schema.contacts,
          and(
            eq(schema.contacts.id, schema.automationLogs.contactId),
            eq(schema.contacts.accountId, accountId)
          )
        )
        .where(eq(schema.automationLogs.accountId, accountId))
        .orderBy(desc(schema.automationLogs.createdAt))
        .limit(10),
    ]);

  const items: ActivityItem[] = [];
  for (const message of messages) {
    if (!message.createdAt) continue;
    items.push({
      id: `msg-${message.id}`,
      kind: 'message',
      text: `New message from ${message.contactName || message.contactPhone || 'Unknown'}`,
      at: message.createdAt,
      href: `/inbox?c=${message.conversationId}`,
    });
  }
  for (const contact of contacts) {
    if (!contact.createdAt) continue;
    items.push({
      id: `contact-${contact.id}`,
      kind: 'contact',
      text: `New contact: ${contact.name || contact.phone}`,
      at: contact.createdAt,
      href: '/contacts',
    });
  }
  for (const deal of deals) {
    if (!deal.updatedAt) continue;
    items.push({
      id: `deal-${deal.id}`,
      kind: 'deal',
      text: deal.stageName
        ? `Deal "${deal.title}" in ${deal.stageName}`
        : `Deal "${deal.title}" updated`,
      at: deal.updatedAt,
      href: '/pipelines',
    });
  }
  for (const broadcast of broadcasts) {
    if (!broadcast.createdAt) continue;
    const recipientCount = broadcast.totalRecipients ?? 0;
    const label =
      broadcast.status === 'sent'
        ? `sent to ${recipientCount} contacts`
        : `${broadcast.status} (${recipientCount} recipients)`;
    items.push({
      id: `broadcast-${broadcast.id}`,
      kind: 'broadcast',
      text: `Broadcast "${broadcast.name}" ${label}`,
      at: broadcast.createdAt,
      href: '/broadcasts',
    });
  }
  for (const log of automationLogs) {
    items.push({
      id: `auto-${log.id}`,
      kind: 'automation',
      text: `Automation "${log.automationName}" ${log.status === 'failed' ? 'failed for' : 'triggered for'} ${log.contactName || log.contactPhone || 'a contact'}`,
      at: log.createdAt,
    });
  }

  return items
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, limit);
}
