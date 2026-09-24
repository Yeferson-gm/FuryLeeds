/**
 * Flow runner.
 *
 * The single entry point `dispatchInboundToFlows` is called by the
 * WhatsApp webhook on every inbound message *for an account that has
 * opted into the Flows beta*. It decides whether the message belongs
 * to an active conversation flow (advance it) or matches the entry
 * trigger of an active flow (start a new run) — and reports back to
 * the webhook so the webhook knows whether to also fire automations.
 *
 * Architecture in a sentence: the runner walks the customer through
 * a DB-stored node graph, suspending only at nodes that need
 * customer input. Each tap or text reply wakes it back up.
 *
 * What lives here vs elsewhere:
 *   - Pure decision logic (which button matched, where to advance to,
 *     when to fallback) — here.
 *   - DB shape (table reads/writes) — here.
 *   - Meta API calls — `meta-send.ts` (engineSendInteractive*).
 *   - Policy resolution (reprompt vs handoff vs end) — `fallback.ts`.
 *   - Type definitions — `types.ts`.
 *
 * Concurrency model:
 *   - Idempotency on `meta_message_id`: the runner refuses to advance
 *     an active run twice for the same Meta message — protects against
 *     Meta's retries.
 *   - Optimistic UPDATE with `current_node_key` precondition: two
 *     simultaneous taps for the same run collide at the DB layer; the
 *     second is a no-op.
 *   - Partial unique index `idx_one_active_run_per_contact`: two
 *     simultaneous starts for the same contact collide; the second
 *     INSERT raises 23505 and the runner catches & exits.
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { addContactTagAndDispatch } from '@/lib/contacts/tag-events';
import { removeContactTag } from '@/lib/contacts/tag-write';
import { db as database, schema, sqlClient } from '@/lib/db';
import { decideFallback, resolveFallbackPolicy } from './fallback';
import {
  engineSendInteractiveButtons,
  engineSendInteractiveList,
  engineSendMedia,
  engineSendText,
} from './meta-send';
import { toFlowNodeRow, toFlowRow, toFlowRunRow } from './repository';
import type {
  CollectInputNodeConfig,
  ConditionNodeConfig,
  DispatchInboundInput,
  DispatchInboundResult,
  FlowNodeRow,
  FlowRow,
  FlowRunRow,
  KeywordTriggerConfig,
  ParsedInbound,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMediaNodeConfig,
  SendMessageNodeConfig,
  SetTagNodeConfig,
  StartNodeConfig,
} from './types';

// ============================================================
// Pure helpers — extracted so engine.test.ts can exercise them
// without a database / Meta mock.
// ============================================================

/**
 * Given a node + the customer's reply_id, return the next_node_key
 * to advance to, or `null` if no option matches.
 */
export function matchReplyId(
  node: { node_type: string; config: Record<string, unknown> },
  reply_id: string
): string | null {
  if (node.node_type === 'send_buttons') {
    const cfg = node.config as unknown as SendButtonsNodeConfig;
    const hit = cfg.buttons?.find((b) => b.reply_id === reply_id);
    return hit?.next_node_key ?? null;
  }
  if (node.node_type === 'send_list') {
    const cfg = node.config as unknown as SendListNodeConfig;
    for (const section of cfg.sections ?? []) {
      const hit = section.rows?.find((r) => r.reply_id === reply_id);
      if (hit) return hit.next_node_key;
    }
    return null;
  }
  return null;
}

/**
 * Case-insensitive contains/exact match against a list of keywords.
 * Used by the trigger evaluator. Stable enough that the v3 builder
 * UI can preview matches by passing canned strings.
 */
export function matchesKeywordTrigger(
  text: string,
  cfg: KeywordTriggerConfig
): boolean {
  if (!text || !cfg.keywords?.length) return false;
  const matchType = cfg.match_type ?? 'contains';
  const haystack = cfg.case_sensitive ? text : text.toLowerCase();
  for (const raw of cfg.keywords) {
    if (!raw) continue;
    const needle = cfg.case_sensitive ? raw : raw.toLowerCase();
    if (
      matchType === 'exact' ? haystack === needle : haystack.includes(needle)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The strings an inbound message offers to a flow's *entry* trigger.
 *
 * Typed text offers itself. A button / list tap offers two: the visible
 * title — what the customer would have typed had the button not been
 * there — and the stable reply_id, because the automation engine's
 * `interactive_reply` trigger routes on the id, so an author moving a
 * menu into a flow reaches for the same value.
 *
 * Matching the id does mean a keyword that happens to be a substring of
 * an id can fire (ids are author-controlled slugs, defaulting to
 * `btn_1`). That is the same substring semantic keyword triggers
 * already have for typed text, and the alternative — ignoring the id —
 * silently breaks the author who keyed on it.
 */
export function entryTriggerTexts(message: ParsedInbound): string[] {
  if (message.kind === 'text') return [message.text];
  return [...new Set([message.reply_title, message.reply_id])].filter(
    (v): v is string => Boolean(v?.trim())
  );
}

/** Nodes that advance to a next_node_key without waiting for input. */
export function isAutoAdvancing(node_type: string): boolean {
  return (
    node_type === 'start' ||
    node_type === 'send_message' ||
    node_type === 'send_media' ||
    node_type === 'condition' ||
    node_type === 'set_tag'
  );
}

/** Nodes that send a prompt and suspend awaiting a customer reply. */
export function isSuspending(node_type: string): boolean {
  return (
    node_type === 'send_buttons' ||
    node_type === 'send_list' ||
    node_type === 'collect_input'
  );
}

/** Nodes that end the run. */
export function isTerminal(node_type: string): boolean {
  return node_type === 'handoff' || node_type === 'end';
}

/**
 * Evaluate a `condition` node's predicate against the current run
 * state. Exported pure for unit testing — the engine wraps it with a
 * DB lookup for `tag` / `contact_field` subjects.
 */
export function evaluateConditionPredicate(args: {
  operator: ConditionNodeConfig['operator'];
  /**
   * Resolved value of the subject. `undefined` means the subject is
   * absent (no var with that key / no such tag / contact field is
   * null). Pure function: caller does the DB lookup.
   */
  subjectValue: string | undefined;
  /** The configured comparison value, when applicable. */
  configValue: string | undefined;
}): boolean {
  switch (args.operator) {
    case 'present':
      return args.subjectValue !== undefined && args.subjectValue !== '';
    case 'absent':
      return args.subjectValue === undefined || args.subjectValue === '';
    case 'equals':
      if (args.subjectValue === undefined) return false;
      return args.subjectValue === (args.configValue ?? '');
    case 'contains':
      if (args.subjectValue === undefined) return false;
      return args.subjectValue.includes(args.configValue ?? '');
  }
}

// ============================================================
// DB I/O — wrapped in tiny helpers so the dispatch flow stays
// readable. Errors surface as thrown — the entry point catches.
// ============================================================

type FlowDatabase = typeof database;

async function loadActiveRunForContact(
  db: FlowDatabase,
  accountId: string,
  contactId: string
): Promise<FlowRunRow | null> {
  // The partial unique index `idx_one_active_run_per_contact` was
  // rebuilt in migration 017 over `(account_id, contact_id)` — so
  // "two active runs for one contact in one account" is impossible
  // by design. But a future migration glitch or manual SQL could
  // create one, and .maybeSingle() throws on >1 row — which would
  // kill dispatch for that contact's webhook entirely. .limit(1) is
  // forgiving: pick the newest, let the cron sweep clean up the
  // stale one.
  const [row] = await db
    .select()
    .from(schema.flowRuns)
    .where(
      and(
        eq(schema.flowRuns.accountId, accountId),
        eq(schema.flowRuns.contactId, contactId),
        eq(schema.flowRuns.status, 'active')
      )
    )
    .orderBy(desc(schema.flowRuns.startedAt))
    .limit(1);
  return row ? toFlowRunRow(row) : null;
}

async function loadFlow(
  db: FlowDatabase,
  flowId: string,
  accountId: string
): Promise<FlowRow | null> {
  const [row] = await db
    .select()
    .from(schema.flows)
    .where(
      and(eq(schema.flows.id, flowId), eq(schema.flows.accountId, accountId))
    )
    .limit(1);
  return row ? toFlowRow(row) : null;
}

/**
 * Load every node of a flow in one round trip and key them by
 * `node_key`. The advance loop is then in-memory — a 5-node
 * auto-advancing chain costs one SELECT, not five.
 *
 * Returns an empty map on error so the caller can still dispatch
 * cleanly (every subsequent .get() returns undefined → the run
 * fails with node_not_found, same as the old per-node lookup).
 */
async function loadAllNodes(
  db: FlowDatabase,
  flowId: string,
  accountId: string
): Promise<Map<string, FlowNodeRow>> {
  const rows = await db
    .select({ node: schema.flowNodes })
    .from(schema.flowNodes)
    .innerJoin(
      schema.flows,
      and(
        eq(schema.flows.id, schema.flowNodes.flowId),
        eq(schema.flows.accountId, accountId)
      )
    )
    .where(eq(schema.flowNodes.flowId, flowId));
  const map = new Map<string, FlowNodeRow>();
  for (const row of rows) {
    const node = toFlowNodeRow(row.node);
    map.set(node.node_key, node);
  }
  return map;
}

async function logEvent(
  db: FlowDatabase,
  flowRunId: string,
  event_type:
    | 'started'
    | 'node_entered'
    | 'message_sent'
    | 'reply_received'
    | 'fallback_fired'
    | 'handoff'
    | 'timeout'
    | 'error'
    | 'completed',
  node_key: string | null,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.insert(schema.flowRunEvents).values({
      flowRunId,
      eventType: event_type,
      nodeKey: node_key,
      payload,
    });
  } catch (error) {
    console.error('[flows] logEvent error:', error);
  }
}

/**
 * Idempotency check — has a `reply_received` event with this Meta
 * message_id already been recorded for any of the contact's flow
 * runs? If yes, the inbound is a duplicate (Meta retry) and we
 * exit without re-advancing.
 *
 * Implementation note: scoped to runs belonging to this user/contact
 * so the lookup is cheap (the index on flow_run_events(flow_run_id,
 * event_type) plus the small set of runs per contact).
 */
async function isDuplicateInbound(
  db: FlowDatabase,
  accountId: string,
  contactId: string,
  metaMessageId: string
): Promise<boolean> {
  // Fetch ALL run ids for this contact in this account (active +
  // historical). Bounded by how many flows the customer has been
  // through — small.
  const runs = await db
    .select({ id: schema.flowRuns.id })
    .from(schema.flowRuns)
    .where(
      and(
        eq(schema.flowRuns.accountId, accountId),
        eq(schema.flowRuns.contactId, contactId)
      )
    );
  if (runs.length === 0) return false;
  const [event] = await db
    .select({ id: schema.flowRunEvents.id })
    .from(schema.flowRunEvents)
    .where(
      and(
        inArray(
          schema.flowRunEvents.flowRunId,
          runs.map((run) => run.id)
        ),
        eq(schema.flowRunEvents.eventType, 'reply_received'),
        sql`${schema.flowRunEvents.payload} ->> 'meta_message_id' = ${metaMessageId}`
      )
    )
    .limit(1);
  return Boolean(event);
}

async function findEntryFlow(
  db: FlowDatabase,
  accountId: string,
  message: ParsedInbound,
  isFirstInbound: boolean
): Promise<FlowRow | null> {
  // A tap used to be rejected outright here, on the reasoning that
  // interactive replies are responses to existing prompts. That holds
  // only while a prompt is outstanding — and this function runs solely
  // when the contact has NO active run, so there is nothing the tap
  // could be answering. What it actually blocked was issue #490: an
  // *automation* sends the buttons, the customer taps one, and the flow
  // whose keyword matches that button never starts. Retyping the label
  // by hand worked, which is the tell — same words, different envelope.
  const candidates = entryTriggerTexts(message);

  // Pull all active flows for this account. Active set is bounded
  // (the builder discourages double-trigger overlap; partial index
  // makes the lookup index-supported).
  const flows = await db
    .select()
    .from(schema.flows)
    .where(
      and(
        eq(schema.flows.accountId, accountId),
        eq(schema.flows.status, 'active')
      )
    )
    .orderBy(asc(schema.flows.createdAt));

  const typed = flows.map(toFlowRow);
  for (const flow of typed) {
    if (flow.trigger_type === 'keyword') {
      const cfg = flow.trigger_config as KeywordTriggerConfig;
      if (candidates.some((text) => matchesKeywordTrigger(text, cfg))) {
        return flow;
      }
    } else if (
      flow.trigger_type === 'first_inbound_message' &&
      isFirstInbound
    ) {
      // Also reachable by a tap now: a broadcast template with a
      // quick-reply button can genuinely be what prompts a contact's
      // first-ever inbound. The automations dispatcher has always
      // treated a tap that way (the webhook pushes
      // `first_inbound_message` regardless of envelope) — flows were
      // the inconsistent half.
      return flow;
    }
    // 'manual' triggers do not auto-start from inbound messages.
  }
  return null;
}

// ============================================================
// Node executors — each handles ONE node type. send_buttons and
// send_list also persist `last_prompt_message_id` so the inbox
// thread can quote the prompt the customer is replying to.
// ============================================================

function requireAddressableRun(run: FlowRunRow): {
  contactId: string;
  conversationId: string;
} {
  if (!run.contact_id || !run.conversation_id) {
    throw new Error(
      `Flow run ${run.id} is missing its contact or conversation.`
    );
  }
  return {
    contactId: run.contact_id,
    conversationId: run.conversation_id,
  };
}

async function sendButtonsAndSuspend(
  db: FlowDatabase,
  run: FlowRunRow,
  node: FlowNodeRow
): Promise<{ outcome: 'advanced'; node_key: string }> {
  const cfg = node.config as unknown as SendButtonsNodeConfig;
  const { contactId, conversationId } = requireAddressableRun(run);
  // Every customer-visible string is interpolated against run.vars —
  // same treatment send_message / collect_input already get (#553).
  // `reply_id` is deliberately NOT interpolated: it is the routing key
  // matchReplyId compares the tapped button against, so it must reach
  // Meta byte-for-byte as authored. Interpolation can push a title past
  // Meta's 20-char cap; meta-api's validator throws a descriptive error
  // and the caller logs it — we never truncate silently.
  const { whatsapp_message_id } = await engineSendInteractiveButtons({
    accountId: run.account_id,
    userId: run.user_id,
    conversationId,
    contactId,
    bodyText: interpolateVars(cfg.text, run.vars),
    headerText: interpolateOptionalVars(cfg.header_text, run.vars),
    footerText: interpolateOptionalVars(cfg.footer_text, run.vars),
    buttons: cfg.buttons.map((b) => ({
      id: b.reply_id,
      title: interpolateVars(b.title, run.vars),
    })),
  });
  await logEvent(db, run.id, 'message_sent', node.node_key, {
    node_type: 'send_buttons',
    whatsapp_message_id,
  });
  const [message] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.messageId, whatsapp_message_id))
    .limit(1);
  await db
    .update(schema.flowRuns)
    .set({ lastPromptMessageId: message?.id ?? null })
    .where(
      and(
        eq(schema.flowRuns.id, run.id),
        eq(schema.flowRuns.accountId, run.account_id)
      )
    );
  return { outcome: 'advanced', node_key: node.node_key };
}

async function sendListAndSuspend(
  db: FlowDatabase,
  run: FlowRunRow,
  node: FlowNodeRow
): Promise<{ outcome: 'advanced'; node_key: string }> {
  const cfg = node.config as unknown as SendListNodeConfig;
  const { contactId, conversationId } = requireAddressableRun(run);
  // See sendButtonsAndSuspend — interpolate every visible string,
  // never the row `reply_id`.
  const { whatsapp_message_id } = await engineSendInteractiveList({
    accountId: run.account_id,
    userId: run.user_id,
    conversationId,
    contactId,
    bodyText: interpolateVars(cfg.text, run.vars),
    buttonLabel: interpolateVars(cfg.button_label, run.vars),
    headerText: interpolateOptionalVars(cfg.header_text, run.vars),
    footerText: interpolateOptionalVars(cfg.footer_text, run.vars),
    sections: cfg.sections.map((s) => ({
      title: interpolateOptionalVars(s.title, run.vars),
      rows: s.rows.map((r) => ({
        id: r.reply_id,
        title: interpolateVars(r.title, run.vars),
        description: interpolateOptionalVars(r.description, run.vars),
      })),
    })),
  });
  await logEvent(db, run.id, 'message_sent', node.node_key, {
    node_type: 'send_list',
    whatsapp_message_id,
  });
  const [message] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.messageId, whatsapp_message_id))
    .limit(1);
  await db
    .update(schema.flowRuns)
    .set({ lastPromptMessageId: message?.id ?? null })
    .where(
      and(
        eq(schema.flowRuns.id, run.id),
        eq(schema.flowRuns.accountId, run.account_id)
      )
    );
  return { outcome: 'advanced', node_key: node.node_key };
}

async function executeHandoff(
  db: FlowDatabase,
  run: FlowRunRow,
  node: FlowNodeRow
): Promise<void> {
  const cfg = node.config as { assign_to?: string; note?: string };
  const conversationPatch: Partial<typeof schema.conversations.$inferInsert> = {
    status: 'pending',
    updatedAt: new Date().toISOString(),
  };
  if (cfg.assign_to) conversationPatch.assignedAgentId = cfg.assign_to;
  if (run.conversation_id) {
    await db
      .update(schema.conversations)
      .set(conversationPatch)
      .where(
        and(
          eq(schema.conversations.id, run.conversation_id),
          eq(schema.conversations.accountId, run.account_id)
        )
      );
  }
  await logEvent(db, run.id, 'handoff', node.node_key, {
    note: cfg.note ?? null,
    assigned_to: cfg.assign_to ?? null,
  });
  await endRun(db, run.id, run.account_id, 'handed_off', 'handoff_node');
}

/**
 * Resolve a condition node's subject value from DB / run state, then
 * call the pure `evaluateConditionPredicate`. Splits out so the
 * predicate itself stays unit-testable without a database mock.
 *
 * Subject sources:
 *   - `var` → `flow_runs.vars[subject_key]` (captured by collect_input
 *     or http_fetch in v2).
 *   - `tag` → present iff `contact_tags(contact_id, tag_id)` exists.
 *     `subject_key` IS the tag UUID; the SELECT returns 1 row or 0.
 *   - `contact_field` → one of name/email/phone/company on `contacts`.
 */
async function evaluateConditionNode(
  db: FlowDatabase,
  run: FlowRunRow,
  cfg: ConditionNodeConfig
): Promise<boolean> {
  const { contactId } = requireAddressableRun(run);
  let subjectValue: string | undefined;
  if (cfg.subject === 'var') {
    const v = run.vars[cfg.subject_key];
    subjectValue =
      typeof v === 'string' ? v : v === undefined ? undefined : String(v);
  } else if (cfg.subject === 'tag') {
    const [contactTag] = await db
      .select({ id: schema.contactTags.id })
      .from(schema.contactTags)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.id, schema.contactTags.contactId),
          eq(schema.contacts.accountId, run.account_id)
        )
      )
      .where(
        and(
          eq(schema.contactTags.contactId, contactId),
          eq(schema.contactTags.tagId, cfg.subject_key)
        )
      )
      .limit(1);
    subjectValue = contactTag ? cfg.subject_key : undefined;
  } else {
    const ALLOWED = ['name', 'email', 'phone', 'company'] as const;
    type AllowedField = (typeof ALLOWED)[number];
    if (!ALLOWED.includes(cfg.subject_key as AllowedField)) {
      throw new Error(`unsupported contact_field: ${cfg.subject_key}`);
    }
    const [contact] = await db
      .select({
        name: schema.contacts.name,
        email: schema.contacts.email,
        phone: schema.contacts.phone,
        company: schema.contacts.company,
      })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.id, contactId),
          eq(schema.contacts.accountId, run.account_id)
        )
      )
      .limit(1);
    const raw = contact?.[cfg.subject_key as AllowedField];
    subjectValue = typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }
  return evaluateConditionPredicate({
    operator: cfg.operator,
    subjectValue,
    configValue: cfg.value,
  });
}

/**
 * Tiny `{{vars.foo}}` interpolation. Used by send_message + collect_input
 * prompt text so a captured `name` can show up in the next prompt
 * ("Thanks {{vars.name}}, what's your email?"). Missing vars render as
 * empty string — the same behavior as the automations engine.
 */
function interpolateVars(
  template: string,
  vars: Record<string, unknown>
): string {
  if (!template) return '';
  return template.replace(/\{\{vars\.([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * `interpolateVars` for optional config fields (header_text, footer_text,
 * list section titles, row descriptions). An absent field stays absent
 * — `interpolateVars(undefined)` would return "" and meta-api treats
 * header/footer/description by truthiness, so "" is harmless there, but
 * keeping `undefined` means the payload we log and send matches what
 * the author configured rather than sprouting empty strings.
 */
function interpolateOptionalVars(
  template: string | undefined,
  vars: Record<string, unknown>
): string | undefined {
  return template === undefined || template === null
    ? undefined
    : interpolateVars(template, vars);
}

async function endRun(
  db: FlowDatabase,
  runId: string,
  accountId: string,
  status: 'completed' | 'handed_off' | 'timed_out' | 'failed',
  reason: string
): Promise<void> {
  await db
    .update(schema.flowRuns)
    .set({
      status,
      endedAt: new Date().toISOString(),
      endReason: reason,
    })
    .where(
      and(
        eq(schema.flowRuns.id, runId),
        eq(schema.flowRuns.accountId, accountId)
      )
    );
}

// ============================================================
// The synchronous advance loop. Walks through auto-advance nodes
// until it hits one that suspends (send_buttons/send_list) or
// terminates (handoff/end). Each suspending node persists the
// new current_node_key before returning.
// ============================================================

async function advanceFromNodeKey(
  db: FlowDatabase,
  run: FlowRunRow,
  startNodeKey: string,
  nodes: Map<string, FlowNodeRow>
): Promise<{ outcome: 'advanced' | 'completed' | 'handed_off' }> {
  const { contactId, conversationId } = requireAddressableRun(run);
  let currentKey: string | null = startNodeKey;
  // Defensive cap — if a flow has a cycle (which the validator
  // SHOULD catch but doesn't yet in v1), we bail rather than loop.
  for (let safety = 0; safety < 64; safety += 1) {
    if (!currentKey) {
      await logEvent(db, run.id, 'error', null, {
        reason: 'next_node_key was null mid-advance',
      });
      await endRun(db, run.id, run.account_id, 'failed', 'missing_next_node');
      return { outcome: 'completed' };
    }
    const node: FlowNodeRow | null = nodes.get(currentKey) ?? null;
    if (!node) {
      await logEvent(db, run.id, 'error', currentKey, {
        reason: 'node_not_found',
      });
      await endRun(db, run.id, run.account_id, 'failed', 'node_not_found');
      return { outcome: 'completed' };
    }
    await logEvent(db, run.id, 'node_entered', node.node_key, {
      node_type: node.node_type,
    });

    if (node.node_type === 'start') {
      currentKey = (node.config as unknown as StartNodeConfig).next_node_key;
      continue;
    }
    if (node.node_type === 'send_message') {
      const cfg = node.config as unknown as SendMessageNodeConfig;
      try {
        const { whatsapp_message_id } = await engineSendText({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId,
          contactId,
          text: interpolateVars(cfg.text, run.vars),
        });
        await logEvent(db, run.id, 'message_sent', node.node_key, {
          node_type: 'send_message',
          whatsapp_message_id,
        });
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'send_text_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, run.account_id, 'failed', 'send_text_failed');
        return { outcome: 'completed' };
      }
      currentKey = cfg.next_node_key;
      continue;
    }
    if (node.node_type === 'send_media') {
      const cfg = node.config as unknown as SendMediaNodeConfig;
      try {
        const { whatsapp_message_id } = await engineSendMedia({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId,
          contactId,
          kind: cfg.media_type,
          link: cfg.media_url,
          caption: cfg.caption
            ? interpolateVars(cfg.caption, run.vars)
            : undefined,
          filename: cfg.filename,
        });
        await logEvent(db, run.id, 'message_sent', node.node_key, {
          node_type: 'send_media',
          media_type: cfg.media_type,
          whatsapp_message_id,
        });
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'send_media_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, run.account_id, 'failed', 'send_media_failed');
        return { outcome: 'completed' };
      }
      currentKey = cfg.next_node_key;
      continue;
    }
    if (node.node_type === 'collect_input') {
      // Send the prompt and suspend. Customer's next TEXT reply will
      // wake us up via handleReplyForActiveRun's collect_input branch.
      const cfg = node.config as unknown as CollectInputNodeConfig;
      try {
        const { whatsapp_message_id } = await engineSendText({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId,
          contactId,
          text: interpolateVars(cfg.prompt_text, run.vars),
        });
        await logEvent(db, run.id, 'message_sent', node.node_key, {
          node_type: 'collect_input',
          whatsapp_message_id,
        });
        const [message] = await db
          .select({ id: schema.messages.id })
          .from(schema.messages)
          .where(eq(schema.messages.messageId, whatsapp_message_id))
          .limit(1);
        await db
          .update(schema.flowRuns)
          .set({ lastPromptMessageId: message?.id ?? null })
          .where(
            and(
              eq(schema.flowRuns.id, run.id),
              eq(schema.flowRuns.accountId, run.account_id)
            )
          );
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'collect_input_prompt_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(
          db,
          run.id,
          run.account_id,
          'failed',
          'collect_input_prompt_failed'
        );
        return { outcome: 'completed' };
      }
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.account_id,
        run.current_node_key,
        node.node_key
      );
      if (!advanced) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'lost_race_during_advance',
        });
      }
      return { outcome: 'advanced' };
    }
    if (node.node_type === 'condition') {
      const cfg = node.config as unknown as ConditionNodeConfig;
      let branch: 'true' | 'false';
      try {
        branch = (await evaluateConditionNode(db, run, cfg)) ? 'true' : 'false';
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'condition_evaluation_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(
          db,
          run.id,
          run.account_id,
          'failed',
          'condition_evaluation_failed'
        );
        return { outcome: 'completed' };
      }
      currentKey = branch === 'true' ? cfg.true_next : cfg.false_next;
      await logEvent(db, run.id, 'node_entered', node.node_key, {
        condition_result: branch,
        advancing_to: currentKey,
      });
      continue;
    }
    if (node.node_type === 'set_tag') {
      const cfg = node.config as unknown as SetTagNodeConfig;
      try {
        if (cfg.mode === 'add') {
          await addContactTagAndDispatch({
            db,
            accountId: run.account_id,
            contactId,
            tagId: cfg.tag_id,
            context: {
              conversation_id: run.conversation_id ?? undefined,
              vars: run.vars,
            },
          });
        } else {
          await removeContactTag(db, {
            accountId: run.account_id,
            contactId,
            tagId: cfg.tag_id,
          });
        }
      } catch (err) {
        // Non-fatal — log + advance. A tag-write failure shouldn't
        // strand the customer mid-flow.
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'set_tag_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      currentKey = cfg.next_node_key;
      continue;
    }
    if (node.node_type === 'send_buttons') {
      // Same failure contract as send_message / send_media /
      // collect_input above: log + fail the run. Previously an
      // exception here (Meta error, or meta-api's length validation —
      // now reachable via interpolation, see sendButtonsAndSuspend)
      // escaped to dispatchInboundToFlows' catch, which only
      // console.error'd and left the run active + stuck on the prior
      // node with nothing in flow_run_events.
      try {
        await sendButtonsAndSuspend(db, run, node);
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'send_buttons_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(
          db,
          run.id,
          run.account_id,
          'failed',
          'send_buttons_failed'
        );
        return { outcome: 'completed' };
      }
      // Persist the new current_node_key via optimistic UPDATE.
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.account_id,
        run.current_node_key,
        node.node_key
      );
      if (!advanced) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'lost_race_during_advance',
        });
      }
      return { outcome: 'advanced' };
    }
    if (node.node_type === 'send_list') {
      try {
        await sendListAndSuspend(db, run, node);
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'send_list_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, run.account_id, 'failed', 'send_list_failed');
        return { outcome: 'completed' };
      }
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.account_id,
        run.current_node_key,
        node.node_key
      );
      if (!advanced) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'lost_race_during_advance',
        });
      }
      return { outcome: 'advanced' };
    }
    if (node.node_type === 'handoff') {
      await executeHandoff(db, run, node);
      return { outcome: 'handed_off' };
    }
    if (node.node_type === 'end') {
      await logEvent(db, run.id, 'completed', node.node_key);
      await endRun(db, run.id, run.account_id, 'completed', 'end_node');
      return { outcome: 'completed' };
    }
    // Unknown node type — shouldn't happen given the CHECK constraint.
    await logEvent(db, run.id, 'error', node.node_key, {
      reason: `unknown_node_type:${node.node_type}`,
    });
    await endRun(db, run.id, run.account_id, 'failed', 'unknown_node_type');
    return { outcome: 'completed' };
  }
  // Safety break — log + fail.
  await logEvent(db, run.id, 'error', currentKey, {
    reason: 'advance_loop_safety_break',
  });
  await endRun(db, run.id, run.account_id, 'failed', 'advance_loop_overflow');
  return { outcome: 'completed' };
}

/**
 * Optimistic UPDATE — only advance current_node_key when it matches
 * the value we read at the top of dispatch. If another webhook beat
 * us, the row's pointer has already moved and our UPDATE returns
 * zero rows; we treat that as a no-op and let the other run continue.
 */
async function advanceCurrentNodeKey(
  db: FlowDatabase,
  runId: string,
  accountId: string,
  expectedOldKey: string | null,
  newKey: string
): Promise<boolean> {
  const currentNodePredicate =
    expectedOldKey === null
      ? sql`${schema.flowRuns.currentNodeKey} IS NULL`
      : eq(schema.flowRuns.currentNodeKey, expectedOldKey);
  const rows = await db
    .update(schema.flowRuns)
    .set({
      currentNodeKey: newKey,
      lastAdvancedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(schema.flowRuns.id, runId),
        eq(schema.flowRuns.accountId, accountId),
        eq(schema.flowRuns.status, 'active'),
        currentNodePredicate
      )
    )
    .returning({ id: schema.flowRuns.id });
  return rows.length > 0;
}

// ============================================================
// Public entry point — the webhook calls this on every inbound.
// ============================================================

export async function dispatchInboundToFlows(
  input: DispatchInboundInput & { isFirstInboundMessage: boolean }
): Promise<DispatchInboundResult> {
  const db = database;
  try {
    const activeRun = await loadActiveRunForContact(
      db,
      input.accountId,
      input.contactId
    );

    // Idempotency — only matters if there's already a run for this
    // contact. For new runs, the partial unique index catches duplicate
    // starts at INSERT time.
    if (activeRun) {
      const dupe = await isDuplicateInbound(
        db,
        input.accountId,
        input.contactId,
        input.message.meta_message_id
      );
      if (dupe) {
        return {
          consumed: true,
          flow_run_id: activeRun.id,
          outcome: 'duplicate_inbound_ignored',
        };
      }
      // One SELECT for the whole flow's nodes — advance loop is now
      // in-memory. See loadAllNodes.
      const nodes = await loadAllNodes(db, activeRun.flow_id, input.accountId);
      return handleReplyForActiveRun(db, activeRun, input.message, nodes);
    }

    // No active run → look for a flow whose entry trigger matches.
    const flow = await findEntryFlow(
      db,
      input.accountId,
      input.message,
      input.isFirstInboundMessage
    );
    if (!flow?.entry_node_id) {
      return { consumed: false, outcome: 'no_match' };
    }
    const nodes = await loadAllNodes(db, flow.id, input.accountId);
    return startNewRun(db, flow, input, nodes);
  } catch (err) {
    console.error(
      '[flows] dispatchInboundToFlows threw:',
      err instanceof Error ? err.message : err
    );
    return { consumed: false, outcome: 'no_match' };
  }
}

async function handleReplyForActiveRun(
  db: FlowDatabase,
  run: FlowRunRow,
  message: ParsedInbound,
  nodes: Map<string, FlowNodeRow>
): Promise<DispatchInboundResult> {
  // Note: we intentionally do NOT persist the raw customer text. A
  // `collect_input` prompt that asks "what's your card number?" would
  // otherwise leave the PAN sitting in flow_run_events.payload forever,
  // visible to anyone with access to the runs viewer or the events
  // table. Length is enough for "did they actually reply?" debugging;
  // for the captured value itself, the `node_entered` event already
  // records `captured_key` + `captured_length` after the var is stored.
  await logEvent(db, run.id, 'reply_received', run.current_node_key, {
    meta_message_id: message.meta_message_id,
    reply_kind: message.kind,
    reply_id: message.kind === 'interactive_reply' ? message.reply_id : null,
    text_length: message.kind === 'text' ? message.text.length : null,
  });

  if (!run.current_node_key) {
    // Defensive — a run with status='active' but no current node is
    // malformed. Fail the run rather than spin.
    await endRun(
      db,
      run.id,
      run.account_id,
      'failed',
      'active_run_missing_current_node'
    );
    return {
      consumed: true,
      flow_run_id: run.id,
      outcome: 'no_match',
    };
  }

  const currentNode = nodes.get(run.current_node_key) ?? null;
  if (!currentNode) {
    await endRun(
      db,
      run.id,
      run.account_id,
      'failed',
      'current_node_not_found'
    );
    return { consumed: true, flow_run_id: run.id, outcome: 'no_match' };
  }

  // Two ways a reply can advance:
  //   1. Interactive button/list tap on a send_buttons/send_list node.
  //   2. Text reply on a collect_input node — capture into vars.
  //
  // Everything else falls through to the fallback policy below.
  let matched: string | null = null;
  if (
    message.kind === 'interactive_reply' &&
    (currentNode.node_type === 'send_buttons' ||
      currentNode.node_type === 'send_list')
  ) {
    matched = matchReplyId(currentNode, message.reply_id);
  } else if (
    message.kind === 'text' &&
    currentNode.node_type === 'collect_input'
  ) {
    const cfg = currentNode.config as unknown as CollectInputNodeConfig;
    const captured = message.text.trim();
    if (captured.length > 0 && cfg.var_key) {
      // Persist captured value + reset reprompt count atomically.
      const newVars = { ...run.vars, [cfg.var_key]: captured };
      await db
        .update(schema.flowRuns)
        .set({ vars: newVars, repromptCount: 0 })
        .where(
          and(
            eq(schema.flowRuns.id, run.id),
            eq(schema.flowRuns.accountId, run.account_id)
          )
        );
      run.vars = newVars;
      run.reprompt_count = 0;
      await logEvent(db, run.id, 'node_entered', currentNode.node_key, {
        captured_key: cfg.var_key,
        captured_length: captured.length,
      });
      matched = cfg.next_node_key;
    }
  }

  if (matched) {
    // Reset reprompt count on a successful match. Skip the write when
    // already 0 — the collect_input capture branch above already
    // zeroed it, and interactive-reply matches against a fresh run
    // (post-prior-reset) are also already 0. The previous re-read of
    // the whole row was needed only because we weren't mirroring the
    // capture UPDATE into the in-memory `run`; now that we do, the
    // local copy is the source of truth.
    if (run.reprompt_count !== 0) {
      await db
        .update(schema.flowRuns)
        .set({ repromptCount: 0 })
        .where(
          and(
            eq(schema.flowRuns.id, run.id),
            eq(schema.flowRuns.accountId, run.account_id)
          )
        );
      run.reprompt_count = 0;
    }
    const outcome = await advanceFromNodeKey(db, run, matched, nodes);
    return {
      consumed: true,
      flow_run_id: run.id,
      outcome: outcome.outcome,
    };
  }

  // No match → fallback. Apply the policy.
  const policy = resolveFallbackPolicy(
    (await loadFlow(db, run.flow_id, run.account_id))?.fallback_policy
  );
  const newReprompts = run.reprompt_count + 1;
  await db
    .update(schema.flowRuns)
    .set({ repromptCount: newReprompts })
    .where(
      and(
        eq(schema.flowRuns.id, run.id),
        eq(schema.flowRuns.accountId, run.account_id)
      )
    );

  const action = decideFallback({ policy, reprompt_count: newReprompts });
  await logEvent(db, run.id, 'fallback_fired', run.current_node_key, {
    action: action.type,
    reprompt_count: newReprompts,
  });
  if (action.type === 'ignore') {
    // Don't consume — let automations have a shot at it.
    return { consumed: false, flow_run_id: run.id, outcome: 'no_match' };
  }
  if (action.type === 'reprompt') {
    // Re-send the same prompt. Same node, no current_node_key change.
    // The interactive helpers interpolate run.vars themselves, so a
    // reprompt renders the same text the original prompt did. A send
    // failure here is logged but does not end the run — the customer
    // still has the original prompt on screen and can retry.
    try {
      if (currentNode.node_type === 'send_buttons') {
        await sendButtonsAndSuspend(db, run, currentNode);
      } else if (currentNode.node_type === 'send_list') {
        await sendListAndSuspend(db, run, currentNode);
      } else if (currentNode.node_type === 'collect_input') {
        // Customer typed something we couldn't accept (empty after trim,
        // or var_key missing — rare). Re-send the prompt so they try again.
        const cfg = currentNode.config as unknown as CollectInputNodeConfig;
        const { contactId, conversationId } = requireAddressableRun(run);
        await engineSendText({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId,
          contactId,
          text: interpolateVars(cfg.prompt_text, run.vars),
        });
      }
    } catch (err) {
      await logEvent(db, run.id, 'error', currentNode.node_key, {
        reason: 'reprompt_send_failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return { consumed: true, flow_run_id: run.id, outcome: 'fallback_fired' };
  }
  if (action.type === 'handoff') {
    if (run.conversation_id) {
      await db
        .update(schema.conversations)
        .set({ status: 'pending', updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.conversations.id, run.conversation_id),
            eq(schema.conversations.accountId, run.account_id)
          )
        );
    }
    await logEvent(db, run.id, 'handoff', run.current_node_key, {
      reason: 'fallback_exhausted',
    });
    await endRun(
      db,
      run.id,
      run.account_id,
      'handed_off',
      'fallback_exhausted'
    );
    return { consumed: true, flow_run_id: run.id, outcome: 'handed_off' };
  }
  // action.type === 'end'
  await endRun(
    db,
    run.id,
    run.account_id,
    'completed',
    'fallback_exhausted_end'
  );
  return { consumed: true, flow_run_id: run.id, outcome: 'completed' };
}

async function startNewRun(
  db: FlowDatabase,
  flow: FlowRow,
  input: DispatchInboundInput,
  nodes: Map<string, FlowNodeRow>
): Promise<DispatchInboundResult> {
  const entryNodeId = flow.entry_node_id;
  if (!entryNodeId) {
    throw new Error(`Flow ${flow.id} has no entry node.`);
  }

  let run: FlowRunRow;
  try {
    run = await sqlClient.begin(async (transaction) => {
      const rows = (await transaction`
        INSERT INTO flow_runs (
          flow_id,
          account_id,
          user_id,
          contact_id,
          conversation_id,
          status,
          current_node_key
        )
        VALUES (
          ${flow.id}::uuid,
          ${flow.account_id}::uuid,
          ${flow.user_id},
          ${input.contactId}::uuid,
          ${input.conversationId}::uuid,
          'active',
          ${entryNodeId}
        )
        RETURNING *
      `) as FlowRunRow[];
      const inserted = rows[0];
      if (!inserted) throw new Error('flow run insert returned no row');

      await transaction`
        INSERT INTO flow_run_events (
          flow_run_id,
          event_type,
          node_key,
          payload
        )
        VALUES (
          ${inserted.id}::uuid,
          'started',
          ${flow.entry_node_id},
          ${JSON.stringify({
            flow_id: flow.id,
            trigger_type: flow.trigger_type,
            meta_message_id: input.message.meta_message_id,
          })}::jsonb
        )
      `;
      await transaction`
        UPDATE flows
        SET
          execution_count = execution_count + 1,
          last_executed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${flow.id}::uuid
          AND account_id = ${flow.account_id}::uuid
      `;
      return inserted;
    });
  } catch (error) {
    const candidate = error as {
      code?: string;
      cause?: { code?: string };
      message?: string;
    };
    if (
      candidate.code === '23505' ||
      candidate.cause?.code === '23505' ||
      candidate.message?.includes('duplicate key')
    ) {
      return { consumed: true, outcome: 'duplicate_inbound_ignored' };
    }
    console.error('[flows] startNewRun transaction error:', error);
    return { consumed: false, outcome: 'no_match' };
  }

  // Run the advance loop starting from the entry node.
  const outcome = await advanceFromNodeKey(db, run, entryNodeId, nodes);
  return {
    consumed: true,
    flow_run_id: run.id,
    outcome: outcome.outcome === 'advanced' ? 'started' : outcome.outcome,
  };
}
