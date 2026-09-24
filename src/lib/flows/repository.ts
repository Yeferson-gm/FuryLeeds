import type { schema } from '@/lib/db';
import type { FlowNodeRow, FlowRow, FlowRunRow } from './types';

type FlowDbRow = typeof schema.flows.$inferSelect;
type FlowNodeDbRow = typeof schema.flowNodes.$inferSelect;
type FlowRunDbRow = typeof schema.flowRuns.$inferSelect;
type FlowRunEventDbRow = typeof schema.flowRunEvents.$inferSelect;

export function toFlowRow(row: FlowDbRow): FlowRow {
  return {
    id: row.id,
    account_id: row.accountId,
    user_id: row.userId,
    name: row.name,
    description: row.description,
    status: row.status as FlowRow['status'],
    trigger_type: row.triggerType as FlowRow['trigger_type'],
    trigger_config: row.triggerConfig as FlowRow['trigger_config'],
    entry_node_id: row.entryNodeId,
    fallback_policy: row.fallbackPolicy as FlowRow['fallback_policy'],
    execution_count: row.executionCount,
    last_executed_at: row.lastExecutedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function toFlowNodeRow(row: FlowNodeDbRow): FlowNodeRow {
  return {
    id: row.id,
    flow_id: row.flowId,
    node_key: row.nodeKey,
    node_type: row.nodeType as FlowNodeRow['node_type'],
    config: row.config as Record<string, unknown>,
    position_x: row.positionX,
    position_y: row.positionY,
    created_at: row.createdAt,
  };
}

export function toFlowRunRow(row: FlowRunDbRow): FlowRunRow {
  return {
    id: row.id,
    flow_id: row.flowId,
    account_id: row.accountId,
    user_id: row.userId,
    contact_id: row.contactId,
    conversation_id: row.conversationId,
    status: row.status as FlowRunRow['status'],
    current_node_key: row.currentNodeKey,
    last_prompt_message_id: row.lastPromptMessageId,
    vars: row.vars as Record<string, unknown>,
    reprompt_count: row.repromptCount,
    started_at: row.startedAt,
    last_advanced_at: row.lastAdvancedAt,
    ended_at: row.endedAt,
    end_reason: row.endReason,
  };
}

export function toFlowRunEventRow(row: FlowRunEventDbRow) {
  return {
    id: row.id,
    flow_run_id: row.flowRunId,
    event_type: row.eventType,
    node_key: row.nodeKey,
    payload: row.payload as Record<string, unknown>,
    created_at: row.createdAt,
  };
}
