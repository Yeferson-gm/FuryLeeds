# Security Checklist

## Use

Complete applicable sections for every feature, fix, dependency, migration, and release. A checked item means verified by code/test/operations evidence, not assumed.

## Trust boundaries and data

- [ ] Entry points, actors, data flows, external services, and privileged operations are identified.
- [ ] Sensitive data is classified: credentials, sessions, API keys, message/contact content, files, AI keys/prompts, email addresses, phone numbers.
- [ ] Data sent to Meta, ChatSend, Imgora, Google, AI providers, or customer webhooks is minimized and documented.
- [ ] Retention/deletion/export requirements and backup copies are considered.

## Authentication and sessions

- [ ] Protected browser/API routes verify Better Auth sessions server-side.
- [ ] Production `BETTER_AUTH_URL` is canonical HTTPS and trusted origins are intentional.
- [ ] `BETTER_AUTH_SECRET` is high entropy, deployment-managed, and rotation impact is planned.
- [ ] Email/password verification/reset paths do not enumerate accounts or leak token URLs.
- [ ] Optional Google OAuth is enabled only when client ID and secret are both configured; callbacks match canonical origin.
- [ ] Session cookies retain secure, HttpOnly, SameSite behavior appropriate to Better Auth and HTTPS.
- [ ] State-changing browser routes assess CSRF/origin protection; GET never performs mutation.

## Authorization and tenancy

- [ ] `accountId` comes from authenticated profile/API-key/configuration context, not request-selected scope.
- [ ] Every business query/mutation constrains account ownership, including nested IDs.
- [ ] Owner/admin/agent/viewer rules are explicit and tested.
- [ ] API keys are hashed, revocable, expiry-checked, account-bound, and scope-checked.
- [ ] Error responses do not reveal whether another account’s resource exists.
- [ ] Socket.IO joins account/user rooms only after session/account lookup; conversation joins verify account ownership.
- [ ] No claim of PostgreSQL RLS is made: current isolation is application-query based.

## Input and output

- [ ] Body, query, path, headers, enums, strings, arrays, pagination, dates, and numeric bounds are validated before expensive work.
- [ ] Responses expose allowlisted DTO fields rather than raw database rows/secrets.
- [ ] CSV/formula injection, Unicode/phone normalization, duplicate fields, and oversized imports are considered.
- [ ] React escaping is preserved; `dangerouslySetInnerHTML` is avoided or sanitized with a reviewed policy.
- [ ] Error details/stacks are not returned to untrusted callers.

## Secrets and cryptography

- [ ] No secret is committed, placed in public env variables, client bundles, URLs, logs, screenshots, or build layers.
- [ ] `ENCRYPTION_KEY` lifecycle is documented; rotation does not silently make stored Meta credentials unrecoverable.
- [ ] Encryption uses authenticated encryption and unique nonces through existing helpers.
- [ ] HMAC comparisons use constant-time logic when practical.
- [ ] API keys/tokens are generated with cryptographic entropy and stored one-way where lookup permits.
- [ ] Credential exposure triggers revocation/rotation and session impact review.

## Meta WhatsApp

- [ ] POST webhook verifies `X-Hub-Signature-256` over exact raw bytes before JSON parse/processing.
- [ ] Missing `META_APP_SECRET` fails closed.
- [ ] Verification tokens/access tokens remain encrypted and redacted.
- [ ] `phone_number_id` resolves one stored account configuration; ambiguity never falls back.
- [ ] Duplicate provider message IDs and replayed/out-of-order statuses are safe.
- [ ] Template/media operations validate account ownership and provider handles.
- [ ] Send/broadcast/react endpoints have auth, account scope, and abuse limits.

## ChatSend email

- [ ] Base URL/configuration is validated and credentials remain server-side.
- [ ] OAuth access tokens, email links, reset OTPs, recipients, and email body are never logged.
- [ ] User messaging matches actual enqueue outcome; non-202 and malformed responses fail safely.
- [ ] Timeout, deferred delivery, retry/idempotency, OTP expiry/attempt/rate limits, and duplicate mail impact are understood.
- [ ] Email HTML escapes user-controlled values.

## Imgora and files

- [ ] MIME type, extension/name, size, collection, account ID, and subfolder are validated.
- [ ] Reverse proxy and app size limits agree.
- [ ] Imgora API URL/origin use expected schemes/hosts; API key never reaches browser.
- [ ] Opaque references are HMAC-signed and checked against expected account and collection.
- [ ] File retrieval/deletion requires current authorization and does not permit IDOR/path traversal.
- [ ] Active content, SVG/HTML, malware, content disposition, and CDN caching behavior are reviewed.
- [ ] Partial upload/database failure and orphan cleanup are defined.

## Outbound URLs and webhooks

- [ ] Customer webhook targets pass SSRF validation at save and delivery time.
- [ ] Private, loopback, link-local, metadata, and rebinding targets are rejected; redirects are disabled.
- [ ] Payloads are HMAC signed with timestamp/replay guidance.
- [ ] Secrets are encrypted at rest and never returned after creation where possible.
- [ ] Timeout, bounded failures, disable/recovery, and delivery guarantees are accurately documented.

## Realtime and background work

- [ ] Socket origin policy is intentional behind the chosen reverse proxy.
- [ ] Event payloads contain only minimum tenant-safe data.
- [ ] Reconnect and missed-event recovery cannot leak another account’s state.
- [ ] Cron endpoints require `AUTOMATION_CRON_SECRET` and scheduler requests do not leak it.
- [ ] Claims/locks/idempotency prevent duplicate campaigns, automations, and flow executions.
- [ ] `after()` work is not described as durable; process crash behavior is addressed.

## AI

- [ ] AI provider keys are encrypted, account-scoped, server-only, and redacted.
- [ ] Customer/message/knowledge data sent to providers is disclosed and minimized.
- [ ] Prompt injection cannot grant tools, secrets, cross-account retrieval, or privileged actions.
- [ ] Output is treated as untrusted, escaped, bounded, and human-reviewed where impact warrants.
- [ ] Cost/rate limits, timeout, model allowlist, data retention, and fallback are defined.

## Platform and supply chain

- [ ] Bun lockfile is committed and reviewed; install scripts/trusted dependencies are justified.
- [ ] Security headers remain effective. CSP is currently report-only and includes unsafe script/style allowances; enforcing/tightening it needs measured remediation.
- [ ] HSTS is emitted only behind correctly configured HTTPS and domain ownership supports its scope.
- [ ] PostgreSQL is private/restricted with least-privilege credentials; backups are encrypted and restore-tested.
- [ ] Reverse proxy supports WebSocket securely, bounds bodies/timeouts, and does not trust spoofable forwarded headers without configuration.
- [ ] Empty Docker/Compose definitions, absent health checks, and absent current CI are resolved before claiming hardened automated deployment.

## Logging and incident readiness

- [ ] Logs contain no raw secrets, auth headers, cookies, PII/message bodies/files/prompts.
- [ ] Security events are observable with bounded, non-enumerating metadata.
- [ ] Key rotation, database restore, webhook reconciliation, and provider outage runbooks have owners.
- [ ] Security reporting/contact, alerting, vulnerability scanning, and response SLA are defined (**currently pending decisions**).

## Release blockers

Cross-account access, broken signature/auth checks, exposed credentials, unsafe migration, unbounded public input, unresolved high/critical dependency issue, or missing recovery for destructive changes blocks release.
