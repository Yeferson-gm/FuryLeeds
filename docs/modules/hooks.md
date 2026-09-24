# Hooks catalog

> Exhaustive inventory of `src/hooks` at the time of inspection.

## Related documentation

- [Frontend architecture](../arquitecture/frontend.md)
- [Design system](../arquitecture/design-system.md)
- [Pages](./pages.md)
- [Components](./components.md)

## Summary

| Hook/provider | Responsibility | Primary consumers |
|---|---|---|
| `AuthProvider`, `useAuth` | Session, CRM profile/account, roles and capabilities | Dashboard shell and most account-aware features |
| `useCan` | Typed capability check | Contacts, pipelines, broadcasts, automations, flows, settings, composer |
| `ThemeProvider`, `useTheme` | Accent + light/dark mode | Root layout, appearance settings, mode toggle, toaster |
| `useRealtime` | Conversation Socket.IO subscription and hydration | Inbox page |
| `usePresence` | Presence snapshot/events and local status derivation | Message thread, members list |
| `useTotalUnread` | Unread-conversation count | Sidebar |
| `useUnreadNotifications` | Unread-notification count | Sidebar |
| `useBrowserNotifyPref`, `useBrowserNotifications` | Device preference and browser notifications | Settings card and global listener |
| `useBroadcastSending` | Create/send campaign request and progress | New broadcast wizard |
| `useMediaBlobUrl` | Protected image URL → managed object URL | Inbox media/lightbox |

## `use-auth.tsx`

### Exports

- `AuthProvider({ children })`
- `useAuth()`
- `Profile` and `AccountStatus` types

### Responsibility and dependencies

Combines Better Auth session state from `authClient.useSession()` with CRM account state from `GET /api/account`. It depends on role predicates in `src/lib/auth/roles` and the default currency helper.

### State/data contract

The context exposes:

- Better Auth `user` and overall `loading`;
- CRM `profile`, `profileLoading`, `refreshProfile()`;
- `accountStatus`: `loading`, `ready`, `unlinked`, or `error`, plus an explanatory detail;
- `accountId`, `accountRole`, account name/id/default currency;
- system role and `isSuperadmin`;
- role flags (`isOwner`, `isAdmin`, `isAgent`, `isViewer`);
- capability flags (`canManageMembers`, `canEditSettings`, `canSendMessages`);
- `signOut()`, which signs out and hard-navigates to `/login`.

Profile hydration is keyed by authenticated user id. Missing/invalid account role produces `unlinked`; request failure produces `error`. A fallback value prevents components rendered outside the provider from throwing, but it denies all capabilities.

### Permissions and extension

This hook derives UX capabilities; it does not authorize requests. Add new policy in `src/lib/auth/roles.ts`, then expose it here only if many consumers need the derived value. Keep API enforcement independent.

## `use-can.ts`

### Export

`useCan(action: CanAction): boolean`

Supported actions are `manage-members`, `edit-settings`, `send-messages`, `view-only`, `delete-account`, and `transfer-ownership`.

The hook reads `accountRole` and `profileLoading` from `useAuth`, returns false while unresolved, and dispatches to the pure predicates in `src/lib/auth/roles`. The exhaustive switch intentionally makes TypeScript fail when a new action is added without implementation.

Use this when a boolean is needed for disabled/read-only behavior. Use `<RequireRole>` for conditional rendering and `<GatedButton>` for a discoverable disabled action.

## `use-theme.tsx`

### Exports

- `ThemeProvider({ children })`
- `useTheme()` → `{ theme, setTheme, mode, setMode, toggleMode }`

It manages orthogonal accent (`ThemeId`) and mode (`light|dark`) state. Initial values come from root element attributes already set by the pre-hydration script, with validated local-storage/default fallbacks. Setters update React state, `<html>` data attributes, and local storage. A `storage` listener synchronizes other tabs.

The fallback outside the provider returns defaults and no-op setters. To add theme values, update `src/lib/themes.ts` and token blocks in `src/app/globals.css`; see [design-system.md](../arquitecture/design-system.md).

## `use-realtime.ts`

### Export

`useRealtime({ onConversationEvent?, enabled? })` → `{ isConnected, unsubscribe }`

### Behavior

- Connects to the shared Socket.IO client when enabled.
- Tracks `connect`/`disconnect` state.
- Listens for account-scoped `conversation:changed` events.
- Emits deletes immediately with the conversation id.
- Hydrates insert/update events through `GET /api/inbox?conversation_id=…` before calling the consumer.
- Coalesces events per conversation while hydration is in flight through `loading` and `pending` collections.
- Keeps the callback in a ref so callback identity does not resubscribe the socket.

`unsubscribe()` marks the current subscription inactive; normal effect cleanup also removes listeners and clears queues. New event types should preserve hydration, de-duplication, and exact listener cleanup.

## `use-presence.ts`

### Export

`usePresence(enabled = true)` → `{ getPresence, getRow, now }`

The hook activates only when enabled and `useAuth()` has an `accountId`. It fetches `GET /api/presence`, stores rows in a `Map<userId, PresenceRow>`, refreshes on socket reconnect, and applies `presence:changed` insert/update/delete events. `derivePresence` converts stored status/timestamps to current `online`, `away`, or `offline` state.

The snapshot request uses `AbortController`; socket listeners are removed in cleanup. Consumers call `getPresence(userId)` for display status and `getRow(userId)` when they need the raw timestamp/status.

## `use-total-unread.ts`

`useTotalUnread(): number` uses `useSyncExternalStore` over `src/lib/realtime/summary-store` and returns `total_unread`, defined as conversations with unread inbound messages in the current account. It is SSR-safe through a dedicated server snapshot. The sidebar uses it for the inbox indicator.

## `use-unread-notifications.ts`

`useUnreadNotifications(): number` reads the same external summary store and returns `unread_notifications` for the signed-in user. The sidebar displays a capped `9+` badge. Keep both summary hooks thin so all fetching/socket lifecycle remains centralized in the store.

## `use-browser-notifications.ts`

### Exports

- `useBrowserNotifyPref(): boolean`
- `useBrowserNotifications(): void`

The preference hook reads a device-scoped external store via `useSyncExternalStore`. The notification hook subscribes to `browser-message:created` only when enabled and browser notifications are supported. It:

- requires permission `granted` before showing;
- suppresses duplicates and messages already visible in the active conversation;
- builds safe title/body text through notification helpers;
- tags notifications by conversation;
- focuses the window and navigates to `/inbox?c=…` on click.

The global `BrowserNotificationsListener` invokes this hook inside the authenticated shell. Permission prompting and preference writes belong to `BrowserNotificationsCard`, not this passive listener.

## `use-broadcast-sending.ts`

### Exports

- `useBroadcastSending()` → `{ createAndSendBroadcast, isProcessing, progress }`
- `resolveVariables(variables, contact, customValues?)`
- audience/variable mapping types

`createAndSendBroadcast` posts the wizard payload to `POST /api/whatsapp/broadcast/create`, moves progress from 10 to 100, validates `broadcast_id`, and always clears processing state. The server owns recipient resolution/sending; the hook does not loop recipients.

`resolveVariables` is a pure helper that sorts variable keys numerically, then resolves static values, standard contact fields (`name`, `phone`, `email`, `company`), or custom-field values. When extending variable sources, update both the mapping type and wizard UI/server contract.

## `use-media-blob-url.ts`

### Export

`useMediaBlobUrl(url)` → `{ src, status }`, where status is `idle`, `loading`, `ready`, or `error`.

Public media URLs pass through synchronously. Protected `/api/whatsapp/media/*` image URLs are loaded through the shared credentialed/deduplicated blob cache, converted to object URLs, and revoked when the source changes or the component unmounts. Results are tagged with their source URL to prevent a stale image flash after rapid navigation.

This hook is intentionally image-only. Video/audio should keep a streamable URL rather than buffering the complete payload into a Blob.

## Hook implementation rules

- Hooks that subscribe to sockets, DOM events, storage, or external stores must clean up the exact subscription.
- Account-sensitive hooks should remain inactive until account/session identity is known.
- Do not duplicate server authorization in hook logic; hooks only shape UX.
- Use stable refs/callbacks to avoid reconnect loops.
- For protected media, revoke generated object URLs.
- Add every new hook to this inventory with its return contract and lifecycle.
