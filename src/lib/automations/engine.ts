import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm';
import {
  getTagChainDepth,
  MAX_TAG_CHAIN_DEPTH,
} from '@/lib/contacts/tag-chain';
import {
  addContactTagIfAbsent,
  removeContactTag,
} from '@/lib/contacts/tag-write';
import { db, schema } from '@/lib/db';
import { isDeliverableUrl } from '@/lib/webhooks/ssrf';
import { validateInteractivePayload } from '@/lib/whatsapp/interactive';
import type {
  AssignConversationStepConfig,
  Automation,
  AutomationLogStepResult,
  AutomationStep,
  AutomationTriggerType,
  ConditionStepConfig,
  CreateDealStepConfig,
  InteractiveReplyTriggerConfig,
  KeywordMatchTriggerConfig,
  SendButtonsStepConfig,
  SendListStepConfig,
  SendMessageStepConfig,
  SendTemplateStepConfig,
  SendWebhookStepConfig,
  TagStepConfig,
  TagTriggerConfig,
  UpdateContactFieldStepConfig,
  WaitStepConfig,
} from '@/types';
import {
  engineSendInteractive,
  engineSendTemplate,
  engineSendText,
} from './meta-send';
import { toAutomation } from './repository';

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

export interface AutomationContext {
  /** Raw message text, for keyword_match + message_content conditions. */
  message_text?: string;
  /** Conversation the event belongs to, if any. */
  conversation_id?: string;
  /** Arbitrary variables accumulated during execution. */
  vars?: Record<string, unknown>;
  /** The tag id that was added, for tag_added trigger. */
  tag_id?: string;
  /** Agent the conversation was assigned to, for conversation_assigned. */
  agent_id?: string;
  /** Button / list-row id the customer tapped, for interactive_reply. */
  interactive_reply_id?: string;
}

export interface DispatchInput {
  /** Account-level tenancy key. Drives the lookup of which active
   *  automations to fire — `automations.account_id` is the tenant
   *  isolation after migration 017. Replaces the previous `userId`
   *  field; the per-automation user_id is read off each row when
   *  needed (sender identity for outbound messages, log audit). */
  accountId: string;
  triggerType: AutomationTriggerType;
  contactId?: string | null;
  context?: AutomationContext;
}

/**
 * Fire all active automations matching the given trigger for an
 * account.
 *
 * Must never throw — callers use fire-and-forget from the webhook.
 * All errors are caught and logged; per-automation failures are
 * recorded into automation_logs with status='failed'.
 */
export async function runAutomationsForTrigger(
  input: DispatchInput
): Promise<void> {
  try {
    // Before any step can touch a caller-supplied contact, verify explicit
    // account ownership. A foreign id is refused silently to avoid leaking
    // whether that UUID exists in another tenant.
    if (input.contactId) {
      const [owned] = await db
        .select({ id: schema.contacts.id })
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.id, input.contactId),
            eq(schema.contacts.accountId, input.accountId)
          )
        )
        .limit(1);
      if (!owned) {
        console.warn(
          '[automations] contact not in account, refusing dispatch',
          input.contactId
        );
        return;
      }
    }

    const rows = await db
      .select()
      .from(schema.automations)
      .where(
        and(
          eq(schema.automations.accountId, input.accountId),
          eq(schema.automations.triggerType, input.triggerType),
          eq(schema.automations.isActive, true)
        )
      );
    if (!rows.length) return;

    for (const automation of rows.map(toAutomation)) {
      if (!triggerMatches(automation, input.context)) continue;
      try {
        await executeAutomation(automation, input);
      } catch (err) {
        console.error('[automations] execute failed:', automation.id, err);
      }
    }
  } catch (err) {
    console.error('[automations] dispatch failed:', err);
  }
}

/**
 * Resume a run that was parked at a wait step. Called from the cron
 * endpoint after it grabs a due `automation_pending_executions` row.
 */
export async function resumePendingExecution(pending: {
  id: string;
  automation_id: string;
  /** Audit-only; the automation row carries account_id for tenancy. */
  user_id: string;
  /** Account-scoped lookups read from the automation row, so this
   *  field is just here to mirror the row shape and keep the cron's
   *  pass-through self-documenting. */
  account_id: string;
  contact_id: string | null;
  log_id: string | null;
  parent_step_id: string | null;
  branch: 'yes' | 'no' | null;
  next_step_position: number;
  context: AutomationContext;
}): Promise<void> {
  const [row] = await db
    .select()
    .from(schema.automations)
    .where(
      and(
        eq(schema.automations.id, pending.automation_id),
        eq(schema.automations.accountId, pending.account_id)
      )
    )
    .limit(1);

  if (!row) {
    console.error(
      '[automations] resume: missing automation',
      pending.automation_id
    );
    await markPending(pending.id, pending.account_id, 'failed');
    return;
  }

  try {
    await executeStepsFrom({
      automation: toAutomation(row),
      contactId: pending.contact_id,
      context: pending.context ?? {},
      parentStepId: pending.parent_step_id,
      branch: pending.branch,
      startPosition: pending.next_step_position,
      logId: pending.log_id,
      triggerEvent: 'resumed_wait',
    });
    await markPending(pending.id, pending.account_id, 'done');
  } catch (err) {
    console.error('[automations] resume failed:', err);
    await markPending(pending.id, pending.account_id, 'failed');
  }
}

// ------------------------------------------------------------
// Internal execution
// ------------------------------------------------------------

async function executeAutomation(automation: Automation, input: DispatchInput) {
  const [log] = await db
    .insert(schema.automationLogs)
    .values({
      automationId: automation.id,
      accountId: automation.account_id,
      userId: automation.user_id,
      contactId: input.contactId ?? null,
      triggerEvent: input.triggerType,
      stepsExecuted: [],
      // Pessimistic until execution reaches a terminal path.
      status: 'failed',
    })
    .returning({ id: schema.automationLogs.id });

  if (!log) {
    console.error('[automations] cannot create log');
    return;
  }

  await executeStepsFrom({
    automation,
    contactId: input.contactId ?? null,
    context: input.context ?? {},
    parentStepId: null,
    branch: null,
    startPosition: 0,
    logId: log.id,
    triggerEvent: input.triggerType,
  });

  // Keep the counter increment atomic under concurrent executions.
  await db
    .update(schema.automations)
    .set({
      executionCount: sql`${schema.automations.executionCount} + 1`,
      lastExecutedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(schema.automations.id, automation.id),
        eq(schema.automations.accountId, automation.account_id)
      )
    );
}

interface ExecuteArgs {
  automation: Automation;
  contactId: string | null;
  context: AutomationContext;
  parentStepId: string | null;
  branch: 'yes' | 'no' | null;
  startPosition: number;
  logId: string | null;
  triggerEvent: string;
}

async function executeStepsFrom(args: ExecuteArgs): Promise<void> {
  const scope =
    args.parentStepId === null
      ? isNull(schema.automationSteps.parentStepId)
      : and(
          eq(schema.automationSteps.parentStepId, args.parentStepId),
          eq(schema.automationSteps.branch, args.branch ?? 'yes')
        );
  const rows = await db
    .select({
      id: schema.automationSteps.id,
      automationId: schema.automationSteps.automationId,
      parentStepId: schema.automationSteps.parentStepId,
      branch: schema.automationSteps.branch,
      stepType: schema.automationSteps.stepType,
      stepConfig: schema.automationSteps.stepConfig,
      position: schema.automationSteps.position,
      createdAt: schema.automationSteps.createdAt,
    })
    .from(schema.automationSteps)
    .innerJoin(
      schema.automations,
      and(
        eq(schema.automations.id, schema.automationSteps.automationId),
        eq(schema.automations.accountId, args.automation.account_id)
      )
    )
    .where(
      and(
        eq(schema.automationSteps.automationId, args.automation.id),
        gte(schema.automationSteps.position, args.startPosition),
        scope
      )
    )
    .orderBy(asc(schema.automationSteps.position));
  const steps: AutomationStep[] = rows.map((step) => ({
    id: step.id,
    automation_id: step.automationId,
    parent_step_id: step.parentStepId,
    branch: step.branch as 'yes' | 'no' | null,
    step_type: step.stepType as AutomationStep['step_type'],
    step_config: step.stepConfig as AutomationStep['step_config'],
    position: step.position,
    created_at: step.createdAt,
  }));

  if (steps.length === 0) {
    if (args.parentStepId === null && args.logId) {
      await finalizeLog(
        args.logId,
        args.automation.account_id,
        'success',
        null
      );
    }
    return;
  }

  const results: AutomationLogStepResult[] = [];
  let status: 'success' | 'partial' | 'failed' = 'success';
  let errorMessage: string | null = null;

  for (const step of steps) {
    // `wait` is the suspension point: enqueue and stop processing this
    // scope. The cron endpoint will pick it up later.
    if (step.step_type === 'wait') {
      const cfg = step.step_config as WaitStepConfig;
      const ms = waitMs(cfg);
      await db.insert(schema.automationPendingExecutions).values({
        automationId: args.automation.id,
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        contactId: args.contactId,
        logId: args.logId,
        parentStepId: args.parentStepId,
        branch: args.branch,
        nextStepPosition: step.position + 1,
        context: args.context,
        runAt: new Date(Date.now() + ms).toISOString(),
        status: 'pending',
      });
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'success',
        detail: `waiting ${cfg.amount} ${cfg.unit}`,
      });
      status = 'partial';
      await appendResults(
        args.logId,
        args.automation.account_id,
        results,
        status,
        errorMessage
      );
      return;
    }

    try {
      if (step.step_type === 'condition') {
        const cfg = step.step_config as ConditionStepConfig;
        const taken = await evaluateCondition(cfg, args);
        results.push({
          step_id: step.id,
          step_type: 'condition',
          status: 'success',
          detail: `branch=${taken ? 'yes' : 'no'}`,
        });
        // Recurse into the chosen branch at position 0 (children use their
        // own ordering within the branch scope).
        await executeStepsFrom({
          ...args,
          parentStepId: step.id,
          branch: taken ? 'yes' : 'no',
          startPosition: 0,
          logId: args.logId,
        });
        continue;
      }

      const detail = await runStep(step, args);
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'success',
        detail,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'failed',
        detail: msg,
      });
      status = 'failed';
      errorMessage = msg;
      break;
    }
  }

  if (args.parentStepId === null) {
    await appendResults(
      args.logId,
      args.automation.account_id,
      results,
      status,
      errorMessage
    );
  } else {
    // Nested branch — just append results; parent scope decides final status.
    await appendResults(
      args.logId,
      args.automation.account_id,
      results,
      null,
      errorMessage
    );
  }
}

async function runStep(
  step: AutomationStep,
  args: ExecuteArgs
): Promise<string> {
  switch (step.step_type) {
    case 'send_message': {
      const cfg = step.step_config as SendMessageStepConfig;
      if (!args.contactId) throw new Error('send_message needs a contact');
      const text = interpolate(cfg.text, args);
      if (!text.trim()) throw new Error('send_message has empty text');
      const conversationId = await resolveConversationId(args);
      const { whatsapp_message_id } = await engineSendText({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        text,
      });
      return `sent via Meta (${whatsapp_message_id})`;
    }

    case 'send_buttons':
    case 'send_list': {
      const payload = step.step_config as
        | SendButtonsStepConfig
        | SendListStepConfig;
      if (!args.contactId) throw new Error(`${step.step_type} needs a contact`);
      // Validate against Meta's limits before the network call so a bad
      // payload surfaces as a clear failed-step detail rather than a raw
      // Meta 400 mid-conversation.
      const check = validateInteractivePayload(payload);
      if (!check.ok) throw new Error(check.error);
      const conversationId = await resolveConversationId(args);
      const { whatsapp_message_id } = await engineSendInteractive({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        payload,
      });
      return `interactive sent via Meta (${whatsapp_message_id})`;
    }

    case 'send_template': {
      const cfg = step.step_config as SendTemplateStepConfig;
      if (!args.contactId) throw new Error('send_template needs a contact');
      if (!cfg.template_name)
        throw new Error('send_template needs template_name');
      const conversationId = await resolveConversationId(args);
      // Meta templates use positional {{1}}, {{2}}, … placeholders, so
      // we MUST emit params in strict numeric order. Lexicographic sort
      // of "1", "2", …, "10" yields "1", "10", "2", … which silently
      // scrambles every template with ≥10 variables.
      const variables = cfg.variables;
      const params = variables
        ? Object.keys(variables)
            .sort((a, b) => {
              const na = Number(a);
              const nb = Number(b);
              const aNum = Number.isFinite(na);
              const bNum = Number.isFinite(nb);
              if (aNum && bNum) return na - nb;
              if (aNum) return -1;
              if (bNum) return 1;
              return a.localeCompare(b);
            })
            .map((k) => String(variables[k]))
        : [];
      const { whatsapp_message_id } = await engineSendTemplate({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        templateName: cfg.template_name,
        language: cfg.language,
        params,
      });
      return `template sent via Meta (${whatsapp_message_id})`;
    }

    case 'add_tag': {
      const cfg = step.step_config as TagStepConfig;
      if (!args.contactId || !cfg.tag_id)
        throw new Error('add_tag needs contact + tag_id');
      const added = await addContactTagIfAbsent(db, {
        accountId: args.automation.account_id,
        contactId: args.contactId,
        tagId: cfg.tag_id,
      });
      if (!added) return `tag ${cfg.tag_id} already present`;

      const depth = getTagChainDepth(args.context);
      if (depth >= MAX_TAG_CHAIN_DEPTH) {
        console.warn('[automations] tag_added chain depth limit reached', {
          automationId: args.automation.id,
          contactId: args.contactId,
          tagId: cfg.tag_id,
          depth,
        });
        return `tag ${cfg.tag_id} added; tag_added dispatch skipped at depth ${depth}`;
      }

      await runAutomationsForTrigger({
        accountId: args.automation.account_id,
        triggerType: 'tag_added',
        contactId: args.contactId,
        context: {
          ...args.context,
          tag_id: cfg.tag_id,
          vars: {
            ...(args.context.vars ?? {}),
            _tag_chain_depth: depth + 1,
          },
        },
      });
      return `tag ${cfg.tag_id} added and tag_added dispatched`;
    }

    case 'remove_tag': {
      // See add_tag: tenant scoping relies on the runAutomationsForTrigger
      // ownership guard, since contact_tags carries no account_id.
      const cfg = step.step_config as TagStepConfig;
      if (!args.contactId || !cfg.tag_id)
        throw new Error('remove_tag needs contact + tag_id');
      await removeContactTag(db, {
        accountId: args.automation.account_id,
        contactId: args.contactId,
        tagId: cfg.tag_id,
      });
      return `tag ${cfg.tag_id} removed`;
    }

    case 'assign_conversation': {
      const cfg = step.step_config as AssignConversationStepConfig;
      if (!args.contactId)
        throw new Error('assign_conversation needs a contact');
      let agentId = cfg.agent_id;
      if (cfg.mode === 'round_robin') {
        // Pick any member of the account. The existing implementation
        // only ever returned the automation's author; preserving that
        // shape until a real round-robin algorithm replaces it.
        const [profile] = await db
          .select({ userId: schema.profiles.userId })
          .from(schema.profiles)
          .where(eq(schema.profiles.accountId, args.automation.account_id))
          .limit(1);
        agentId = profile?.userId;
      }
      if (!agentId) return 'no agent resolved';
      await db
        .update(schema.conversations)
        .set({ assignedAgentId: agentId })
        .where(
          and(
            eq(schema.conversations.accountId, args.automation.account_id),
            eq(schema.conversations.contactId, args.contactId)
          )
        );
      return `assigned to ${agentId}`;
    }

    case 'update_contact_field': {
      const cfg = step.step_config as UpdateContactFieldStepConfig;
      if (!args.contactId)
        throw new Error('update_contact_field needs a contact');
      // Resolve workflow variables ({{ vars.* }}, {{ message.text }}) so custom
      // values can be populated dynamically from the triggering context.
      const value = interpolate(cfg.value, args);

      // Custom fields are encoded as `custom:<custom_field_id>`; anything else
      // is a built-in contact column.
      if (cfg.field.startsWith('custom:')) {
        const customFieldId = cfg.field.slice('custom:'.length);
        if (!customFieldId) {
          return `field ${cfg.field} not writable from automations`;
        }
        // Confirm the field definition belongs to this account before writing.
        const [field] = await db
          .select({ id: schema.customFields.id })
          .from(schema.customFields)
          .where(
            and(
              eq(schema.customFields.id, customFieldId),
              eq(schema.customFields.accountId, args.automation.account_id)
            )
          )
          .limit(1);
        if (!field) {
          return `field ${cfg.field} not writable from automations`;
        }
        // Upsert on the table's UNIQUE(contact_id, custom_field_id) so repeated
        // runs overwrite rather than duplicate. Tenancy is enforced above and,
        // for the contact side, by the entry-point ownership guard.
        await db
          .insert(schema.contactCustomValues)
          .values({
            contactId: args.contactId,
            customFieldId,
            value,
          })
          .onConflictDoUpdate({
            target: [
              schema.contactCustomValues.contactId,
              schema.contactCustomValues.customFieldId,
            ],
            set: { value },
          });
        return `custom field updated`;
      }

      const allowed = new Set(['name', 'email', 'company']);
      if (!allowed.has(cfg.field)) {
        return `field ${cfg.field} not writable from automations`;
      }
      // Scope the write to the account so a future caller that skips the
      // entry-point ownership guard still cannot write across tenants.
      const contactUpdate =
        cfg.field === 'name'
          ? { name: value }
          : cfg.field === 'email'
            ? { email: value }
            : { company: value };
      await db
        .update(schema.contacts)
        .set({ ...contactUpdate, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.contacts.id, args.contactId),
            eq(schema.contacts.accountId, args.automation.account_id)
          )
        );
      return `${cfg.field} updated`;
    }

    case 'create_deal': {
      const cfg = step.step_config as CreateDealStepConfig;
      if (!cfg.pipeline_id || !cfg.stage_id)
        throw new Error('create_deal needs pipeline + stage');
      // Match the account's configured default currency rather than
      // the static `deals.currency` DB default — keeps automation-
      // created deals consistent with the one-currency-per-account
      // rule (issue #218). Fall back to USD if the row is somehow
      // missing the value (pre-021 forks).
      const [account] = await db
        .select({ defaultCurrency: schema.accounts.defaultCurrency })
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.automation.account_id))
        .limit(1);
      await db.insert(schema.deals).values({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        pipelineId: cfg.pipeline_id,
        stageId: cfg.stage_id,
        contactId: args.contactId,
        title: interpolate(cfg.title, args),
        value: String(cfg.value ?? 0),
        currency: account?.defaultCurrency ?? 'USD',
        status: 'open',
      });
      return 'deal created';
    }

    case 'send_webhook': {
      const cfg = step.step_config as SendWebhookStepConfig;
      if (!cfg.url) throw new Error('send_webhook needs url');
      // SSRF guard: the URL and headers are account-controlled and the
      // server makes the request, so refuse any destination that resolves
      // to a private / loopback / link-local / reserved address. Mirrors
      // the webhook_endpoints delivery path (see lib/webhooks/deliver.ts).
      if (!(await isDeliverableUrl(cfg.url))) {
        throw new Error('send_webhook: destination not allowed');
      }
      const body = cfg.body_template
        ? interpolate(cfg.body_template, args)
        : JSON.stringify(args.context);
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.headers ?? {}) },
        body,
        // Do NOT follow redirects — a public URL could 3xx-bounce to an
        // internal address, defeating the guard above. Bound the request
        // so a hung/slow internal host can't tie up the runner.
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`webhook returned ${res.status}`);
      return `webhook ${res.status}`;
    }

    case 'close_conversation': {
      if (!args.contactId)
        throw new Error('close_conversation needs a contact');
      await db
        .update(schema.conversations)
        .set({ status: 'closed', updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.conversations.accountId, args.automation.account_id),
            eq(schema.conversations.contactId, args.contactId)
          )
        );
      return 'conversation closed';
    }

    default:
      return `unknown step: ${step.step_type}`;
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Pick the conversation a send-type step should use. Prefer the id the
 * webhook handed us (it's the one that just got the inbound message);
 * fall back to the contact's conversation for resumed/wait paths and
 * manual engine POSTs. Throws if none exists — send steps have
 * no meaningful target without a conversation.
 */
async function resolveConversationId(args: ExecuteArgs): Promise<string> {
  const fromCtx = args.context.conversation_id;
  if (fromCtx) return fromCtx;
  if (!args.contactId)
    throw new Error('cannot resolve conversation: no contact');
  const [conversation] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.accountId, args.automation.account_id),
        eq(schema.conversations.contactId, args.contactId)
      )
    )
    .limit(1);
  if (!conversation?.id) {
    const prefix =
      args.triggerEvent === 'tag_added'
        ? 'tag_added automation cannot send'
        : 'cannot send';
    throw new Error(`${prefix}: contact has no existing conversation`);
  }
  return conversation.id;
}

/** Letter, digit or underscore in any script — the "inside a word" test. */
const WORD_CHAR = '[\\p{L}\\p{N}_]';

/**
 * Whole-word keyword test, behind `match_type: 'word'` (issue #409 — a
 * one-letter keyword under `contains` fires on every message containing
 * that letter, e.g. "k" on "thanks").
 *
 * Deliberately NOT `\b`, which is defined against `[A-Za-z0-9_]` and so
 * breaks two cases that matter for WhatsApp traffic:
 *
 *   - A keyword carrying punctuation: `/\bhi!\b/` demands a word character
 *     after the "!", so it never matches "say hi!".
 *   - Any non-Latin script: every character of "안녕" is a non-word
 *     character to `\b`, so `/\b안녕\b/` matches nothing at all.
 *
 * Unicode-aware lookarounds handle both. Note this really is word-based:
 * it won't find "안녕" inside "안녕하세요", because a language that doesn't
 * delimit words with spaces has no word edge there. That's what `contains`
 * is for, and it stays the default.
 *
 * Exported for direct unit testing of the escaping / boundary edges.
 */
export function matchesWholeWord(
  text: string,
  keyword: string,
  caseSensitive = false
): boolean {
  if (!keyword) return false;
  // The keyword is account-supplied free text, so metacharacters have to
  // be literal — otherwise "(" is an unterminated group and RegExp throws.
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?<!${WORD_CHAR})${escaped}(?!${WORD_CHAR})`,
    caseSensitive ? 'u' : 'iu'
  );
  return pattern.test(text);
}

export function triggerMatches(
  automation: Automation,
  ctx: AutomationContext | undefined
): boolean {
  if (automation.trigger_type === 'keyword_match') {
    const cfg = automation.trigger_config as KeywordMatchTriggerConfig;
    if (!cfg?.keywords || cfg.keywords.length === 0) return false;
    const text = (ctx?.message_text ?? '').toString();
    if (!text) return false;
    if (cfg.match_type === 'word') {
      return cfg.keywords.some((raw) =>
        matchesWholeWord(text, raw, cfg.case_sensitive)
      );
    }
    const haystack = cfg.case_sensitive ? text : text.toLowerCase();
    return cfg.keywords.some((raw) => {
      const k = cfg.case_sensitive ? raw : raw.toLowerCase();
      return cfg.match_type === 'exact' ? haystack === k : haystack.includes(k);
    });
  }

  // Match on the tapped button / list-row id (exact). Lets multi-step
  // menus be chained: automation A sends buttons, automation B fires on
  // the reply id and sends the next step.
  if (automation.trigger_type === 'interactive_reply') {
    const cfg = automation.trigger_config as InteractiveReplyTriggerConfig;
    const replyId = ctx?.interactive_reply_id;
    if (
      !replyId ||
      !Array.isArray(cfg?.reply_ids) ||
      cfg.reply_ids.length === 0
    ) {
      return false;
    }
    return cfg.reply_ids.includes(replyId);
  }

  if (automation.trigger_type === 'tag_added') {
    const cfg = automation.trigger_config as TagTriggerConfig;
    const tagId = ctx?.tag_id;
    return Boolean(tagId && cfg?.tag_id && cfg.tag_id === tagId);
  }

  return true;
}

async function evaluateCondition(
  cfg: ConditionStepConfig,
  args: ExecuteArgs
): Promise<boolean> {
  switch (cfg.subject) {
    case 'tag_presence': {
      if (!args.contactId || !cfg.operand) return false;
      // contact_tags has no account_id column, so tenant scoping joins the
      // parent contact and also relies on the trigger ownership guard.
      const [tag] = await db
        .select({ id: schema.contactTags.id })
        .from(schema.contactTags)
        .innerJoin(
          schema.contacts,
          and(
            eq(schema.contacts.id, schema.contactTags.contactId),
            eq(schema.contacts.accountId, args.automation.account_id)
          )
        )
        .where(
          and(
            eq(schema.contactTags.contactId, args.contactId),
            eq(schema.contactTags.tagId, cfg.operand)
          )
        )
        .limit(1);
      return Boolean(tag);
    }
    case 'contact_field': {
      if (!args.contactId || !cfg.operand) return false;
      // Scope to the account so the condition cannot become a cross-tenant
      // read oracle.
      const columns = {
        name: schema.contacts.name,
        email: schema.contacts.email,
        company: schema.contacts.company,
        phone: schema.contacts.phone,
      } as const;
      const column = columns[cfg.operand as keyof typeof columns];
      if (!column) return false;
      const [contact] = await db
        .select({ value: column })
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.id, args.contactId),
            eq(schema.contacts.accountId, args.automation.account_id)
          )
        )
        .limit(1);
      return (
        contact?.value != null &&
        String(contact.value) === String(cfg.value ?? '')
      );
    }
    case 'message_content': {
      const text = (args.context.message_text ?? '').toString();
      return text.toLowerCase().includes((cfg.value ?? '').toLowerCase());
    }
    case 'time_of_day': {
      // operand form "HH:mm-HH:mm" — true if now is within that window
      // (supports over-midnight ranges like "18:00-09:00").
      const [from, to] = (cfg.operand ?? '').split('-');
      if (!from || !to) return false;
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      const parse = (s: string) => {
        const [h, m] = s.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const f = parse(from);
      const t = parse(to);
      return f <= t ? mins >= f && mins < t : mins >= f || mins < t;
    }
    default:
      return false;
  }
}

function waitMs(cfg: WaitStepConfig): number {
  const unitMs =
    cfg.unit === 'days'
      ? 86_400_000
      : cfg.unit === 'hours'
        ? 3_600_000
        : 60_000;
  return Math.max(1_000, cfg.amount * unitMs);
}

function interpolate(s: string, args: ExecuteArgs): string {
  return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const [ns, prop] = String(key).split('.');
    if (ns === 'message' && prop === 'text')
      return String(args.context.message_text ?? '');
    if (ns === 'vars' && prop) return String(args.context.vars?.[prop] ?? '');
    return '';
  });
}

async function appendResults(
  logId: string | null,
  accountId: string,
  newItems: AutomationLogStepResult[],
  status: 'success' | 'partial' | 'failed' | null,
  errorMessage: string | null
) {
  if (!logId) return;
  const update: Partial<typeof schema.automationLogs.$inferInsert> = {
    // A single SQL expression prevents concurrent branch updates from losing
    // each other's result arrays.
    stepsExecuted: sql`COALESCE(${schema.automationLogs.stepsExecuted}, '[]'::jsonb) || ${JSON.stringify(newItems)}::jsonb`,
  };
  if (status !== null) update.status = status;
  if (errorMessage) update.errorMessage = errorMessage;
  await db
    .update(schema.automationLogs)
    .set(update)
    .where(
      and(
        eq(schema.automationLogs.id, logId),
        eq(schema.automationLogs.accountId, accountId)
      )
    );
}

async function finalizeLog(
  logId: string | null,
  accountId: string,
  status: 'success' | 'partial' | 'failed',
  errorMessage: string | null
) {
  if (!logId) return;
  await db
    .update(schema.automationLogs)
    .set({ status, errorMessage })
    .where(
      and(
        eq(schema.automationLogs.id, logId),
        eq(schema.automationLogs.accountId, accountId)
      )
    );
}

async function markPending(
  id: string,
  accountId: string,
  status: 'done' | 'failed'
) {
  await db
    .update(schema.automationPendingExecutions)
    .set({ status })
    .where(
      and(
        eq(schema.automationPendingExecutions.id, id),
        eq(schema.automationPendingExecutions.accountId, accountId)
      )
    );
}
