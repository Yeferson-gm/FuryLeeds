# Git Workflow

## Verified repository facts

At the time this policy was written:

- the checked-out branch is `main`;
- `main` tracks `origin/main`;
- the canonical repository is `git@github.com:Yeferson-gm/FuryLeeds.git`; the previous upstream remote was removed during the FuryLeeds rebrand;
- the first FuryLeeds snapshot intentionally consolidates the substantial reconstruction that existed over the imported history;
- GitHub workflow files from the previous upstream are absent from the FuryLeeds working tree.

These facts do not prove the organization’s branch protection, review, release, or deployment policy. Long-lived branches beyond `main`, required reviewers, merge method, tag scheme, and CI gates are **pending decisions**.

## Safety rules

- Never discard, reset, clean, stash, overwrite, or reformat another contributor’s uncommitted work without explicit authorization.
- Inspect `git status --short --branch` before editing and before reporting completion.
- Keep each change focused; do not mix dependency, migration, formatting, and feature work unless inseparable.
- Never commit secrets, `.env` values, database dumps, customer exports, message content, credentials, or generated local caches.
- Do not commit `.next`, coverage output, editor state, or TypeScript build state unless explicitly intended by repository policy.
- Agents do not commit, push, create branches, rewrite history, or open/merge PRs unless requested.

## Recommended short-lived branches

Until maintainers approve a formal convention, use these only as a proposed default:

```text
feat/<short-description>
fix/<short-description>
docs/<short-description>
test/<short-description>
refactor/<short-description>
chore/<short-description>
hotfix/<short-description>
```

Create from the maintainer-designated base. Do not assume `main` is always the development base merely because it is currently checked out.

## Commits

Recommended format is Conventional Commits, pending formal adoption:

```text
feat(inbox): add account-scoped assignment filter
fix(webhook): preserve idempotency on Meta retry
docs(process): define VPS deployment gates
chore(deps): update Better Auth
```

Commit expectations:

- one coherent reason for change;
- imperative summary, useful scope, no issue-only subject;
- migration and matching schema/code in the same reviewable series;
- `package.json` and `bun.lock` together;
- generated Drizzle migration reviewed, not blindly accepted;
- no “fix lint” churn unrelated to the change.

## Before publishing

Run the smallest relevant checks first, then required gates:

```bash
bun run check
bun run typecheck
bun run test
bun run build
```

A docs-only change may use targeted Markdown/link/diff validation when application behavior is untouched, but must not claim application checks passed unless run.

Review:

```bash
git status --short --branch
git diff --check
git diff --stat
git diff
```

Confirm no secret, generated artifact, debug log, accidental deletion, or unrelated formatter output is included.

## Pull request contract

GitHub hosting is verified; mandatory PR use is not. If the team uses PRs, include:

- problem/user outcome;
- implementation and architecture impact;
- security/tenant/data analysis;
- migrations and deploy ordering;
- tests and exact commands/results;
- screenshots/video for UI changes;
- performance evidence where relevant;
- configuration changes with secret values omitted;
- rollback/roll-forward plan;
- known gaps and follow-ups.

Approval count, code owners, branch protection, signed commits, required checks, and merge strategy remain **pending decisions**.

## Merge and history

- Never force-push shared protected branches.
- Rebase/merge strategy must follow the repository rule once decided; do not invent one.
- Resolve conflicts by understanding both changes, especially schema, lockfile, auth, and webhook code.
- Do not regenerate `bun.lock` or migrations merely to erase conflicts.
- Preserve authorship and issue context.

## Hotfixes

A hotfix is limited to an active production security, data-integrity, or availability incident. Branch/tag/source and backport process are **pending decisions**. Regardless of process:

1. keep scope minimal;
2. add regression coverage where feasible;
3. validate production build/runtime path;
4. document migration/config impact;
5. propagate the fix to every maintained line;
6. perform incident follow-up.

## Releases

Version `0.8.0` exists in `package.json`, but release tagging/changelog semantics are not verified. Do not infer semantic-release automation. Define version ownership, tag format, release notes, artifact retention, promotion environments, and production authorization before formal releases.
