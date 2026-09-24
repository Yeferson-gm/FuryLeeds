# UI pages and routes

> Exhaustive catalog of UI `page.tsx` files and the layouts that shape them. API route handlers are not pages and are therefore outside this catalog.

## Related documentation

- [Frontend architecture](../arquitecture/frontend.md)
- [Design system](../arquitecture/design-system.md)
- [Components](./components.md)
- [Hooks](./hooks.md)

## Route map

| URL | Source | Access | Primary purpose |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Public | Server redirect to `/dashboard` |
| `/login` | `(auth)/login/page.tsx` | Public | Email/password or Google sign-in |
| `/signup` | `(auth)/signup/page.tsx` | Public | Email/password or Google registration |
| `/forgot-password` | `(auth)/forgot-password/page.tsx` | Public | Request and consume password-reset OTP |
| `/join/[token]` | `join/[token]/page.tsx` | Hybrid | Preview and redeem team invitation |
| `/dashboard` | `(dashboard)/dashboard/page.tsx` | Authenticated | CRM overview and analytics |
| `/inbox` | `(dashboard)/inbox/page.tsx` | Authenticated | Realtime conversation workspace |
| `/notifications` | `(dashboard)/notifications/page.tsx` | Authenticated | User notification center |
| `/contacts` | `(dashboard)/contacts/page.tsx` | Authenticated | Contact CRUD/import/detail |
| `/pipelines` | `(dashboard)/pipelines/page.tsx` | Authenticated | Pipeline/deal board and analytics |
| `/broadcasts` | `(dashboard)/broadcasts/page.tsx` | Authenticated | Campaign list |
| `/broadcasts/new` | `(dashboard)/broadcasts/new/page.tsx` | Agent+ for useful mutation | Campaign wizard |
| `/broadcasts/[id]` | `(dashboard)/broadcasts/[id]/page.tsx` | Authenticated | Campaign delivery detail |
| `/automations` | `(dashboard)/automations/page.tsx` | Authenticated | Automation list/templates |
| `/automations/new` | `(dashboard)/automations/new/page.tsx` | Agent+ for useful mutation | New automation builder |
| `/automations/[id]/edit` | `(dashboard)/automations/[id]/edit/page.tsx` | Authenticated; API enforces writes | Edit automation |
| `/automations/[id]/logs` | `(dashboard)/automations/[id]/logs/page.tsx` | Authenticated | Execution logs |
| `/flows` | `(dashboard)/flows/page.tsx` | Authenticated | Flow list/templates |
| `/flows/[id]` | `(dashboard)/flows/[id]/page.tsx` | Authenticated; API enforces writes | Visual flow editor |
| `/flows/[id]/runs` | `(dashboard)/flows/[id]/runs/page.tsx` | Authenticated | Run/event history |
| `/agents` | `(dashboard)/agents/page.tsx` | Authenticated | AI setup, playground, usage |
| `/settings` | `(dashboard)/settings/page.tsx` | Authenticated | Personal/workspace settings |

“Authenticated” describes the shell visibility. UI gates improve UX, but each API endpoint remains the security boundary.

## Shared layouts

### `src/app/layout.tsx`

Global HTML shell. Loads Inter, global tokens, theme boot script, `ThemeProvider`, and `ThemedToaster`; declares Spanish document language and global no-index metadata.

### `src/app/(auth)/layout.tsx`

No-index metadata for login/signup/recovery pages. Each identity page uses `AuthPageShell`, the shared graphite full-page visual wrapper with one FuryLeeds mark and a consistent bordered panel.

### `src/app/(dashboard)/layout.tsx` and `dashboard-shell.tsx`

The server layout exports no-index metadata. The client shell mounts `AuthProvider` and uses Boneyard to preserve responsive sidebar, header, and centered content geometry until both Better Auth and account-profile hydration resolve. Presence heartbeat and browser-notification listeners mount only after that resolution; the normal shell then renders the account-access warning and scrollable feature region.

### `src/app/join/layout.tsx`

Hybrid public/authenticated centered shell. Adds no-index and `no-referrer` metadata because the invitation token is in the path.

## Public and authentication routes

### `/`

A server component that immediately calls `redirect('/dashboard')`. Authentication routing is delegated to the project’s auth/middleware layer.

### `/login`

**UI:** graphite auth shell with one external FuryLeeds mark, login/signup tabs, centered heading, Google and email/password paths, forgot-password link, signup link, Sileo submission errors, verified-email success notice, and invitation-aware copy. The form does not repeat the product logo.

**Inputs/state:** email, password, email-login loading, Google loading, and error. `?verified=true` shows confirmation; `?error=google` shows provider failure; `?invite=TOKEN` preserves invitation context.

**Data/actions:** `authClient.signIn.email` or `authClient.signIn.social`. Normal destination is `/dashboard`; invitation destination is `/join/TOKEN`. Successful email login uses a full navigation so cookie/session state is re-read.

**Extension notes:** preserve `invite` in all auth links/provider callback URLs and keep the `Suspense` wrapper around `useSearchParams`.

### `/signup`

**UI:** invitation-aware registration panel in the same graphite shell, login/signup tabs, centered heading, Google path, full name/email/password/confirmation form, success card asking the user to verify email, and link back to login. The form does not repeat the product logo.

**Validation/state:** password match and minimum eight characters; full name max length 120; local loading/provider/error/success state.

**Data/actions:** `authClient.signUp.email` with callback to `/login?verified=true` or `/join/TOKEN`; Google signup returns to dashboard or invitation. `?error=google` is surfaced inline.

**Extension notes:** invitation tokens must survive signup, verification, login, and provider redirects. Keep the `Suspense` boundary.

### `/forgot-password`

Owns a three-step accessible state machine: request code, enter code/new password, and completion. It calls `authClient.emailOtp.requestPasswordReset` with non-enumerating copy, then `authClient.emailOtp.resetPassword` with normalized six-digit input and matching passwords of at least eight characters. Codes use `autocomplete="one-time-code"`, numeric input semantics, a 10-minute expiry, resend action, inline field/recovery errors, Sileo request failures, and no recovery secret in the URL. Success confirms that the password is usable and links back to login.

### `/join/[token]`

**Purpose:** safely preview and explicitly redeem an account invitation; it never auto-redeems.

**State machine:**

1. invitation/session loading;
2. peek failure (`not_found`, `used`, `expired`, `server_error`) with tailored recovery;
3. valid invitation + anonymous visitor → sign-up/sign-in CTAs preserving the token;
4. valid invitation + authenticated visitor → explicit accept action.

**Data/actions:** `GET /api/invitations/[token]/peek`, `POST /api/invitations/[token]/redeem`, and Better Auth session/sign-out. A 409 redemption conflict opens a blocking dialog and offers sign-out/retry with another identity. Successful redemption hard-navigates to `/dashboard` so `AuthProvider` reloads the new account and role.

**Security:** token is URL-encoded for requests and the layout uses `no-referrer`.

## Authenticated product routes

### `/dashboard`

Composes metric cards, quick actions, conversation trend, pipeline donut, response-time bars, and recent activity. It concurrently calls query helpers for dashboard metrics/series/pipeline/response/activity. Each widget has independent loading/failure behavior; conversation series are cached by 7/30/90-day range. Currency comes from `useAuth`.

No page-specific gate beyond authenticated visibility; quick actions and backing routes govern mutations.

### `/inbox`

**Layout:** three-part workspace: `ConversationList`, active `MessageThread`, and optional `ContactSidebar`, with responsive contact-panel behavior.

**State/data:** conversations, selected conversation/contact, messages, WhatsApp connection state, resync token, and sidebar visibility. `GET /api/inbox` loads lists or deep-linked records. `?c=conversationId` is the canonical deep link and is synchronized with selection using `router.replace`.

**Realtime:** `useRealtime` hydrates conversation events and updates list/selection without a page reload. Thread-level message/reaction/assignment events are handled by `MessageThread`.

**Permissions:** viewers can inspect; message sending is disabled in `MessageComposer` through `useCan('send-messages')`. APIs enforce writes.

**Extension notes:** preserve deep-link URL synchronization without causing list remount/refetch loops; keep active records updated when realtime events replace list objects.

### `/notifications`

Loads `/api/notifications`, listens to realtime notification changes, and renders loading/error/empty/list states. Individual rows can be marked read through `/api/notifications/[id]`; “mark all” calls `/api/notifications/read-all`. Conversation notifications route to `/inbox?c=…`. User/account context comes from `useAuth`; timestamps use shared date formatters.

### `/contacts`

**UI:** searchable/paginated table with tag filters, row/bulk selection, create/edit form, detail sheet, CSV import, custom-fields manager, and single/bulk delete confirmation.

**Data:** contact/tag access is abstracted by `src/lib/contacts/api`; local state covers query, page, totals, selections, dialogs, tags map, edit/detail targets, and pending deletion.

**Permissions:** `send-messages` gates contact-operational mutations; `edit-settings` gates custom-field administration. `GatedButton` communicates read-only restrictions.

**Extension notes:** refresh both row data and tag maps after mutations; preserve server pagination when adding filters; route detail actions through `ContactDetailView` rather than duplicating contact subresources.

### `/pipelines`

Loads pipeline collection, selected pipeline with stages/deals, and supports pipeline selection/creation, DnD board, deal create/edit, analytics, and settings dialogs. Calls `/api/pipelines`, `/api/pipelines/[id]`, and nested deal endpoints.

`send-messages` gates deal creation/operational movement; `edit-settings` gates pipeline configuration/creation. `PipelineBoard` receives stage/deal data and move callbacks; `PipelineSettings` owns stage/name/delete mutations; `DealForm` owns deal/contact fields.

### `/broadcasts`

Campaign table with status metadata, counts, dates, loading/error/empty states, and realtime refresh through the shared socket. `GET /api/whatsapp/broadcast` loads the list. `send-messages` gates the create action; rows navigate to detail.

### `/broadcasts/new`

Four-step client wizard:

1. choose an approved message template;
2. select audience (`all`, tags, custom field, or CSV, with exclusions/estimates);
3. map template variables and optional header media;
4. name, review, optionally schedule, and confirm.

The page owns the current step and aggregate payload. It uses `useBroadcastSending` or `POST /api/whatsapp/broadcast/create`, then routes to `/broadcasts/[id]`. The UI assumes an operational writer; backing API authorization is mandatory.

### `/broadcasts/[id]`

Loads campaign + recipients from `/api/whatsapp/broadcast/[id]` and refreshes on matching `broadcast:changed` events. Displays status, campaign metadata, delivery stat cards, CSS funnel, recipient filters/table, and RFC-4180-style CSV export.

It can resume stranded pending recipients or retry failures through `/resume`. Deletion requires inline confirmation and is disabled while sending. Local state covers filter, loading/error, delete confirmation, and resume scope.

### `/automations`

Loads automation cards and exposes quick-start templates while the account has fewer than three automations. Supports activation with optimistic rollback, duplication, edit/log navigation, and confirmed deletion through `/api/automations/*`.

Creation is gated by `send-messages`. The current component does not separately gate every row mutation in the card, so server-side authorization is especially important for activate/duplicate/delete.

### `/automations/new`

Reads optional `?template=slug`, validates it against `AUTOMATION_TEMPLATES`, expands flat template seeds into the nested builder tree, and renders `AutomationBuilder`. Without a valid template it starts inactive with a `new_message_received` trigger and no steps. The query-param reader is wrapped in `Suspense`.

### `/automations/[id]/edit`

Fetches `/api/automations/[id]`, converts server step nodes with `fromServerSteps`, and renders `AutomationBuilder`. Initial loading uses a spinner; failure offers navigation back to the list. The builder owns persistence and routing after save/delete.

### `/automations/[id]/logs`

Fetches automation metadata and execution logs from `/api/automations/[id]/logs`. Each execution row shows status, contact, trigger, step count, relative time, and an expandable step result list with details/errors. It is read-only and provides loading/error/empty states.

### `/flows`

Lists conversational flows, loads templates in parallel, and provides create-from-scratch/create-from-template, edit, and delete actions. New flows route directly to `/flows/[id]`; rows show status/validation metadata. Creation uses `send-messages` via `GatedButton`; server routes enforce all mutations. Flows are marked Beta in primary navigation.

### `/flows/[id]`

Loads flow and node records from `/api/flows/[id]`, handles loading/not-found states, and passes data into `FlowEditorShell`. The shell/provider coordinates header, toolbox, graph canvas, property forms, validation, save/activation/delete, and navigation to runs.

### `/flows/[id]/runs`

Read-only debugger for the 50 most recent runs and their event timelines. It shows status, contact, current node, timestamps, reprompt count, captured variables, and expandable event lines. Data comes from `/api/flows/[id]/runs`; unknown flow and empty histories have dedicated states.

### `/agents`

Tabs for AI Playground, Setup, and admin-visible Usage. On mount it calls `/api/ai/config`: configured accounts land in Playground; first-time/error cases land in Setup. Usage visibility is derived with `canEditSettings(accountRole)` (admin/owner). Setup embeds `AiConfig`; backing routes must authorize configuration writes even though the tab itself remains visible.

### `/settings`

`?tab=` is the single source of truth; invalid values resolve to `overview`. Navigation uses `router.replace` without scrolling and sits under `Suspense`.

| Tab | Component | Purpose / permission behavior |
|---|---|---|
| `overview` | `SettingsOverview` | Live account/WhatsApp/count summary and shortcuts |
| `profile` | `ProfileForm` | Current user name/avatar |
| `security` | `SecurityPanel` | Password and active sessions |
| `appearance` | `AppearancePanel` | Device theme/mode |
| `whatsapp` | `WhatsAppConfig` | Workspace connection and media mirroring; server/admin policy applies |
| `templates` | `TemplateManager` | WhatsApp templates; server/admin policy applies |
| `quick-replies` | `QuickRepliesManager` | Saved replies/interactive payloads |
| `fields` | `FieldsAndTagsPanel` | Tags and custom fields; edit UI requires `edit-settings` |
| `deals` | `DealsSettings` | Default pipeline currency |
| `members` | `MembersTab` | Roster/presence; invite/change/remove controls are admin-gated |
| `api` | `ApiKeysSettings` | Key listing plus admin-gated create/revoke |

Rail hints show current mode and default currency without extra requests. Personal panels are usable by the signed-in user; workspace mutations rely on role-aware UI and API checks.

## Route extension checklist

- Place public, authenticated, or hybrid pages under the correct layout.
- Add primary destinations to both sidebar navigation and header title mapping.
- Preserve no-index behavior for product/auth/token routes.
- Add `Suspense` around client `useSearchParams` reads.
- Define all loading, error, empty, read-only, and not-found states.
- Apply UI gates and equivalent server authorization.
- Keep URL state (`?tab`, `?c`, invitation/template tokens) stable across navigation.
- Update this route table and the relevant component documentation.
