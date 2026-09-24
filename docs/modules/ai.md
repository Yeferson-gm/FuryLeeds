# AI

Related: [Inbox](inbox-and-messaging.md) · [WhatsApp](whatsapp.md) · [Flows](flows.md) · [Automations](automations.md)

## Purpose and ownership

Owns per-account BYO LLM configuration, draft/playground generation, provider adapters, conversation context, RAG knowledge ingestion/retrieval, inbound auto-reply, human handoff and token usage reporting.

## Important source paths

- `src/lib/ai/*`, `src/lib/ai/providers/*`
- `src/app/api/ai/**`
- Auto-reply caller: `src/app/api/whatsapp/webhook/route.ts`
- Shared encryption: `src/lib/whatsapp/encryption.ts`

## Data model

- `ai_configs`: one per account; OpenAI/Anthropic model, encrypted provider and optional embeddings keys, prompt, active/auto-reply flags, cap 1–20, optional handoff agent.
- `ai_knowledge_documents`: account-owned source text/title.
- `ai_knowledge_chunks`: per-document chunks, generated FTS vector and optional 1536-dimensional embedding.
- `ai_usage_log`: draft/auto-reply provider/model token counts and optional conversation.
- Conversation AI state: disabled flag, atomic reply count, handoff summary; messages can be `ai_generated`.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/ai/config` | GET | Viewer+; masked configuration state. |
| `/api/ai/config` | POST, DELETE | Admin+; validate credentials/embedding key/handoff member, encrypt and upsert/delete. |
| `/api/ai/test` | POST | Admin+, rate limited; test supplied or stored credentials. |
| `/api/ai/draft` | POST | Agent+, per-user/account limited; grounded draft for owned conversation. |
| `/api/ai/playground` | POST | Agent+, rate limited; arbitrary chat against saved config even if inactive. |
| `/api/ai/autoreply/:conversationId` | POST | Agent+, rate limited; pause/resume per-conversation auto-reply. |
| `/api/ai/knowledge` | GET, POST | Viewer lists; admin creates and indexes. |
| `/api/ai/knowledge/:id` | GET, PATCH, DELETE | Viewer reads; admin edits/reindexes/deletes. |
| `/api/ai/knowledge/reindex` | POST | Admin+, rate limited; rebuild all chunks. |
| `/api/ai/usage` | GET | Admin+; bounded period summaries/recent rows. |

## Main flows

- Provider config decrypts only server-side. Generation normalizes OpenAI/Anthropic usage and detects `[[HANDOFF]]`.
- Context loads recent non-empty conversation turns chronologically; bot/agent become assistant.
- Knowledge chunks text; embeddings use OpenAI `text-embedding-3-small`; retrieval takes semantic matches then tops up with PostgreSQL FTS.
- Auto-reply gates: active+enabled config, no active message automation, conversation exists/unassigned/not disabled/below cap, non-empty context and account rate budget.
- It shows typing best-effort, retrieves knowledge, generates, logs usage best-effort, handles handoff or atomically claims a reply slot and sends a bot message.
- Flows have priority; interactive and flow-consumed inbound messages never reach AI.

## Authorization and tenant boundary

Every config/document/chunk/usage/conversation query carries `account_id`. Handoff user must be a same-account profile. Draft verifies the conversation account before loading context.

## Realtime/events

AI-sent messages use normal WhatsApp send persistence and trigger thread/conversation realtime. Handoff updates conversation assignment/AI fields. There is no AI-specific socket event.

## Failure modes

- Missing/inactive config or failed eligibility generally returns/skips safely.
- Invalid/decrypt-failed credentials, provider 401/429/5xx, malformed/empty provider result and timeout map to `AiError`.
- Embedding failure still stores lexical chunks, then surfaces the ingestion error; retrieval degrades to FTS/empty.
- Typing indicator and usage logging are best-effort.
- In-memory rate limits are per process.
- Reply slot is claimed after generation, so a lost race can consume provider tokens without sending.

## Tests

`test/lib/ai/*` covers config activity, context, chunking, embeddings/batching, providers, sentinel/handoff, RAG fallback, auto-reply gates/races/typing/handoff and usage logging. API route authorization/config persistence has less direct coverage.

## Extension rules

- Add providers behind the normalized provider interface and `AiError` mapping.
- Encrypt every secret and never return decrypted values.
- Keep retrieval best-effort and tenant-filtered.
- Preserve precedence: flows, deterministic automations, then AI; assigned humans always win.
- Update schema provider checks and tests with provider additions.
