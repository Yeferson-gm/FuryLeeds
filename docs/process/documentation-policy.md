# Documentation Policy

## Purpose

Documentation is part of FuryLeeds’s operational and security contract. It must describe the current repository truth, explicitly proposed requirements, and unresolved decisions without blending them.

## Truth labels

Use these labels when ambiguity is possible:

- **Current / Verified:** observed in current code, configuration, tests, or repository metadata.
- **Required:** an engineering or release gate adopted by these process documents.
- **Proposed:** a recommendation awaiting maintainer adoption.
- **Pending decision:** operational or governance information that cannot be verified.
- **Historical:** behavior no longer present; include only when needed for migration/incident context.

Never copy another project’s branch model, deployment platform, environment topology, provider choice, SLO, command, or architecture as if it applied here.

## Sources of truth

Order evidence as follows:

1. running behavior and automated tests;
2. current source and SQL migrations;
3. current `package.json`, lockfile, and configuration;
4. process/architecture/module docs;
5. issue/PR discussion;
6. historical Git content or external examples.

When sources disagree, document the discrepancy and correct the lower-authority source in the same workstream where in scope. Do not conceal uncertainty.

## Required updates by change type

### API or route

Document method/path, authentication, role/scope, account boundary, request/response/error contract, pagination/rate limit, idempotency, and examples without secrets.

### Database

Document schema meaning, migration order, compatibility/backfill, indexes/constraints, retention, data sensitivity, and deploy/recovery implications. SQL migration remains authoritative for applied structure.

### Auth/security

Update threat assumptions, secret/config names, cookie/API-key/webhook behavior, role matrix, rotation/recovery, and relevant checklist/tests.

### Realtime/background

Document event name/version/payload, room audience, source trigger, reconnect/refetch behavior, durability limits, scheduler/claim/retry/failure behavior.

### External provider

Document configuration names (never values), data sent, endpoints/contract assumptions, timeout, retry/idempotency, provider failure mapping, credentials, and sandbox verification.

### UI

Document user flow, role visibility, loading/empty/error states, accessibility, and screenshots only when maintainable and free of sensitive data.

### Dependency/tooling/deployment

Update dependency rationale, commands, lockfile expectations, runtime compatibility, environment variables, health/observability, deploy order, and rollback/roll-forward.

## Repository documentation map

- `README.md`: human project entry point, local setup, environment-variable inventory, validation, and deployment warnings.
- `docs/README.md`: complete documentation index, reading flows, ownership matrix, and language policy.
- `docs/arquitecture/`: architecture documentation (directory spelling is current repository reality; renaming is out of scope unless deliberately migrated).
- `docs/modules/`: feature/integration module contracts and page/component/hook inventories.
- `docs/process/`: engineering and operations policies, including this file.
- `docs/arquitecture/decisions.md`: accepted durable decisions and explicitly pending choices.
- `docs/TODO.md`: authoritative in-repository list for scoped debt discovered outside the active task.
- `MEMORY.md`: current completed work, blockers, validation, and immediate next actions.
- Code comments: only non-obvious invariants, provider quirks, safety constraints, and rationale close to code.
- Tests: executable behavior examples, not a replacement for user/operator contracts.

## Style

- English is the primary documentation language; retain Spanish UI/error examples when they are part of product behavior.
- Use concise headings, active voice, exact project-relative paths, and executable commands.
- Define acronyms at first use and use one name consistently (`accountId` in code, account boundary in prose).
- Explain why and constraints, not line-by-line implementation.
- Use dates/versions when claims can expire.
- Examples use synthetic IDs/domains and placeholders such as `<redacted>`; never real customer/provider data.
- Link relatively within the repository and avoid brittle line-number links.

## Security and privacy

Never document live secrets, connection strings, bearer/session/API keys, webhook secrets, reset/verification URLs, encrypted credential values, production IPs not meant to be public, customer names/phones/emails/messages, file URLs, or AI prompt/knowledge content. Screenshots and logs must be redacted at source and checked for metadata.

Environment variable documentation includes purpose, required/optional status, format, owner, and restart/rotation impact—not values.

## Architecture decisions

Material, durable choices use the lightweight ADR format in `docs/arquitecture/decisions.md`: sequential identifier, date, status, context, decision, consequences, and links. Accepted records are append-only in intent; supersede a decision explicitly rather than silently replacing its history.

Horizontal scaling, durable queues, future RLS, provider replacement, container/orchestrator choice, backup architecture, distributed rate limiting, CSP enforcement, and E2E tooling require a new decision record when adopted. Until then they remain clearly labeled pending rather than described as implemented.

## Review and freshness

Documentation is reviewed with code. Reviewers verify commands, paths, versions, links, security redaction, and fact/requirement/pending distinctions. Meaningful behavior change with stale docs is incomplete.

At release/quarterly cadence (**exact cadence pending**), review:

- dependency/runtime versions;
- environment/config inventory;
- routes/provider contracts;
- deployment/backup/restore and incident contacts;
- observability/performance budgets;
- pending decisions and obsolete warnings.

Each policy should be updated when the corresponding decision is made rather than keeping “pending” indefinitely.

## Validation

For documentation changes:

- inspect `git diff --check`;
- verify every referenced path/command exists;
- test commands when practical and report whether they ran;
- validate internal links with an approved checker if one is adopted;
- confirm only requested files changed;
- review for secrets and unsupported claims.

Do not run broad formatters in a dirty tree solely for Markdown.

## Deprecation and deletion

Do not leave contradictory legacy docs. When behavior is removed, delete or clearly mark obsolete guidance and update inbound links. Preserve historical rationale in Git or decision records, not as active instructions. A replacement doc must state its scope and authority.

## Ownership gaps

Documentation owner, required reviewers, published location, changelog/release-note policy, API specification format, and link-check automation are **pending decisions**. Until resolved, the author of a behavior change owns its matching documentation in the same workstream.
