# Component catalog

> Exhaustive inventory of files under `src/components`. “Permissions” describes UI behavior only; API routes remain the authorization boundary.

## Related documentation

- [Frontend architecture](../arquitecture/frontend.md)
- [Design system](../arquitecture/design-system.md)
- [Pages](./pages.md)
- [Hooks](./hooks.md)

## Permission shorthand

- **All authenticated:** viewer, agent, admin, owner can render/read.
- **Operational (`agent+`):** capability `send-messages`.
- **Workspace admin (`admin+`):** capabilities `edit-settings` or `manage-members`.
- **Owner:** irreversible account/ownership actions.

## Agents

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `agents/ai-playground.tsx` — `AiPlayground` | Chat-like test surface for the configured AI agent. | Local turns, prompt input, send state and scroll ref; `POST /api/ai/playground`; `Button`, `cn`. | Visible to authenticated users. Keep test calls isolated from customer conversations; preserve setup callback for missing configuration. |
| `agents/ai-usage.tsx` — `AiUsageCard` | Usage/cost chart and period selection. | 30-day default window, loading/data state; `/api/ai/usage?days=`; auth/default currency, role helpers, Tremor chart/select/card/date formatting. | Parent `/agents` shows it only to admin/owner. New metrics should preserve currency/date aggregation contract. |

## Authentication UI and gates

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `auth/auth-page-shell.tsx` — `AuthPageShell` | Shared graphite shell for login, signup, password recovery/reset, and invitation redemption; owns the single FuryLeeds mark, optional auth tabs, atmospheric grid, panel boundary, and protected-access footer. | Server-safe composition with Next links, semantic navigation, and `cn`; no remote state. | Public. Preserve one product mark per page, keyboard focus, invitation-aware tab links, and responsive centering. |
| `auth/require-role.tsx` — `RequireRole` | Conditional render by minimum account role, with optional fallback. | `useAuth`, `hasMinRole`; no remote state. | Returns fallback while unresolved/under-ranked. UI-only; mirror checks on the server. |

## Automations

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `automations/automation-builder.tsx` — `AutomationBuilder`, `toApiSteps`, `fromServerSteps` | Complete create/edit builder for trigger configuration and nested action/condition branches. | Large local builder tree, expanded/advanced/resource/form state; `/api/automations`, `/api/automations/[id]`, `/api/automations/resources`, `/api/account/members`; interactive builder, UI controls, tree helpers, WhatsApp payload types. | Intended for operational writers; API must enforce. Add step kinds in types, tree conversion, editor UI, serialization, and engine together. Preserve client IDs vs server order/parent mapping. |

## Broadcast wizard

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `broadcasts/step1-choose-template.tsx` — `Step1ChooseTemplate` | Loads and selects an approved WhatsApp template. | Loading/error/template state; `/api/whatsapp/broadcast/resources`; `Button`, template types. | Agent+ workflow. Keep status eligibility aligned with server/Meta rules. |
| `broadcasts/step2-select-audience.tsx` — `Step2SelectAudience` | Audience mode, inclusion/exclusion tags, custom-field rule, CSV selection, estimate. | Tags/fields/count/loading/file refs; resources endpoint; CSV parser. | Agent+ workflow. New audience modes require hook/server payload changes and an estimate path. |
| `broadcasts/step3-personalize.tsx` — `Step3Personalize` | Maps body variables and header media; previews with first matching contact. | Fields/contact/custom values and loading states; resources endpoint; input/select/template types. | Agent+ workflow. Keep variable indexes and media requirements synchronized with template validator/send builder. |
| `broadcasts/step4-schedule-send.tsx` — `Step4ScheduleSend` | Final review, naming/scheduling, reach estimate, confirmation. | Estimated reach/loading; resources endpoint; input/button plus shared SweetAlert2 action confirmation. | Agent+ workflow. Extend scheduling fields in aggregate page payload and API contract together. |

## Contacts

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `contacts/contact-detail-view.tsx` — `ContactDetailView` | Contact side-sheet with profile, tags/custom values, notes/deals/activity and direct/template messaging. | Contact APIs, tag API, `/api/whatsapp/send`, auth currency, tabs/sheet/form state. | Read for all; mutations operational. Parent controls entry gate, APIs enforce. Add detail sections here to avoid duplicating contact subresource logic. |
| `contacts/contact-form.tsx` — `ContactForm` | Create/edit contact dialog with normalized phone, duplicate lookup and tag assignment. | Name/phone/email/company, duplicate-check and tag loading/selection; contact/dedupe/tag helpers. | Operational. Preserve phone normalization and duplicate-confirm flow when adding identifiers. |
| `contacts/custom-fields-manager.tsx` — `CustomFieldsManager`, `CustomFieldsPanel` | CRUD/order UI for contact custom-field definitions. | Local draft/dialog/list updates via contact API; button/dialog/input. | Workspace admin when used from settings/contacts. New field types need API/schema and rendering support. |
| `contacts/import-modal.tsx` — `ImportModal` | Parse, preview, validate and submit contact CSV imports, including company/tags. | File/rows/column flags/tag-color map/import result; CSV parser and contacts API. | Operational. Keep parser limits, dedupe semantics and result counts visible. |

## Dashboard

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `dashboard/activity-feed.tsx` — `ActivityFeed` | Recent CRM activity list with client page-size selection. | Props plus local `5/10/25/50` page size; dashboard types. | Read-only. Add activity kinds with icon/label mapping and server query. |
| `dashboard/conversations-chart.tsx` — `ConversationsChart` | Responsive inbound/outbound conversation trend and range controls. | Series props; memoized geometry, resize/hover state; dashboard types. | Read-only. Preserve all range buckets and accessible labels when changing chart shape. |
| `dashboard/empty-state.tsx` — `EmptyState` | Reusable icon/title/description/action empty panel. | Props and `cn`; stateless. | No gate. Prefer for dashboard-like empty surfaces. |
| `dashboard/metric-card.tsx` — `MetricCard` | KPI value, icon, delta/subtitle card. | Props only; `cn`. | Read-only. Delta semantics should not rely on color alone. |
| `dashboard/pipeline-donut.tsx` — `PipelineDonut` | Pipeline value distribution summary/donut. | Data/loading/currency props; currency formatter. | Read-only. Keep zero/empty/loading states distinct. |
| `dashboard/quick-actions.tsx` — `QuickActions` | Links to common product tasks. | Static Next links/icons; no remote state. | Destination pages enforce/gate writes. Add actions only for stable routes. |
| `dashboard/response-time-chart.tsx` — `ResponseTimeChart` | Response-time summary and bucket chart. | Props, Tremor bar chart, date utilities. | Read-only. Keep duration units explicit. |
| `dashboard/skeleton.tsx` — `Skeleton`, `SkeletonCard` | Loading placeholders. | Class props and `cn`; stateless. | No gate. Match final component dimensions to limit layout shift. |

## Flow editor

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `flows/flow-editor-state.tsx` — `FlowEditorProvider`, `useFlowEditor`, helpers | Central flow graph transaction state and persistence. | Flow/nodes, dirty/selection, saving/activating/flash state; `PATCH/DELETE /api/flows/[id]`, activation endpoint; edge/validation helpers and router. | Operational writes; API enforced. New node types need defaults, validation, forms, metadata, engine support. |
| `flows/flow-editor-shell.tsx` — `FlowEditorShell` | Responsive composition of provider, header, toolbox/builder, canvas and validation panel. | Initial flow/nodes props; editor components/layout classes. | Same as editor. Keep provider at this boundary so all panels share one state. |
| `flows/flow-builder.tsx` — `FlowBuilder` | Node palette/search/categories and compact node list controls. | Expanded/search/draft/advanced UI state; validation, badges, buttons, dropdown/input/select. | Operational. Register new nodes through shared metadata rather than hard-coded duplicate labels. |
| `flows/flow-canvas.tsx` — `FlowCanvas` | XYFlow graph, selection, connection, position and node actions. | Derived React Flow nodes/edges, selected node, local RF nodes; editor context, layout/edge helpers, sheet/menu; flow API for some actions. | Operational. Preserve conversion between domain nodes and React Flow nodes and save positions explicitly. |
| `flows/forms/fields.tsx` — `TextRow`, `NextNodeRow`, `NodeKeySelect` | Reusable node-form rows for text and next-node references. | Controlled props, input/select/textarea. | No direct gate. Use to keep node forms consistent. |
| `flows/forms/node-config-form.tsx` — `NodeConfigForm` | Type-specific selected-node configuration. | Editor context/controlled config, `/api/tags`, media upload helper, controls. | Operational. Every new node type needs a form branch and validated config shape. |
| `flows/header.tsx` — `EditorHeader` | Back navigation, name/status, save/activate, runs and delete actions. | Flow editor context, router, buttons. | Operational actions; API enforced. Keep dirty/saving/validation feedback visible. |
| `flows/shared.tsx` — node constants/helpers, `NodeIconChip` | Canonical node categories, labels, icons/colors, slug/summarization helpers. | Flow types and `cn`; pure except rendering icon chip. | No gate. This is the UI registry for node types. |
| `flows/validation-panel.tsx` — `ValidationPanel`, `IssueLine` | Displays validation errors/warnings and selects affected nodes. | Editor context, validation helpers; derived issues. | Read-only display. Add actionable issue metadata when validation rules expand. |

## Inbox and messaging

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `inbox/conversation-list.tsx` — `ConversationList` | Search/filter/tag/company conversation list and selection. | Search/filter/loading/tags/selected tags/company; `GET /api/inbox`; dates, scroll area, menu/input. | Read for all. Keep query construction and selected row identity stable under realtime replacement. |
| `inbox/message-thread.tsx` — `MessageThread` | Active conversation header/timeline and orchestration of send/template/media/reply/reaction/assignment actions. | Messages plus loading/template/profile/reaction/reply/lightbox/refresh state; inbox resources/conversation routes, WhatsApp send/react, socket events, presence, uploads. | Read for all; child composer gates sending, APIs enforce all mutations. Centralize new message event handling here. |
| `inbox/message-bubble.tsx` — `MessageBubble` | Direction/status-aware message rendering with text, media, interactive payload, reply and actions. | Message/reaction/callback props; interactive preview, dates, utility classes. | Read-only; actions supplied by parent. Add message kinds with fallback copy. |
| `inbox/message-composer.tsx` — `MessageComposer`, media constants | Text/media/audio/interactive composer, AI draft and quick-reply save/picker. | Text/sending/drafting/interactive/media/upload/recording state; Base UI naming dialog; `useCan('send-messages')`; `/api/ai/draft`, `/api/quick-replies`, upload helper. | Operational. Viewer controls are gated. Ordinary text input remains a Base UI form rather than a browser prompt or SweetAlert2 action alert. |
| `inbox/message-media.tsx` — media bubble exports | Image/video/audio/document renderers and unavailable/download states. | Per-media broken/download state; protected image hook and download helper. | Read-only. Images may blob-load; video/audio must remain streamable. |
| `inbox/media-lightbox.tsx` — `MediaLightbox` | Gallery dialog, navigation, zoom and download for message media. | Open item/gallery props; zoom/broken/download state; blob URL/date/download/gallery helpers. | Read-only. Preserve keyboard/dialog semantics and object URL lifecycle. |
| `inbox/message-actions.tsx` — `MessageActions` | Hover/touch action affordance and emoji reaction picker. | Touch/picker state; popover and callbacks. | Parent/API determine write access. Keep touch path equivalent to hover path. |
| `inbox/message-reactions.tsx` — `MessageReactions` | Aggregated reaction chips and toggle callbacks. | Reaction/message props; derived grouping. | Parent/API gate mutation. |
| `inbox/reply-quote.tsx` — `ReplyQuote`, `buildReplyPreview` | Quoted-message block and concise preview generation. | Pure message/callback props. | No gate. Extend preview mapping with new media/message types. |
| `inbox/template-picker.tsx` — `TemplatePicker` | Approved template selection plus body/header/button parameter collection and preview. | Templates/loading/selection/params state; `/api/inbox/resources`; validators and dialog controls. | Operational send flow. Keep slot completeness aligned with send builder. |
| `inbox/quick-reply-picker.tsx` — `QuickReplyPicker` | Loads and selects saved text/interactive quick replies. | Open/loading/items state; `GET /api/quick-replies`; dialog. | Operational use. Return typed interactive payloads unchanged. |
| `inbox/contact-sidebar.tsx` — `ContactSidebar` | Compact contact identity, deals, notes and tags beside thread. | Copy/deals/notes/tags/new-note states; `/api/inbox/contacts/[id]` and notes; date/identity helpers. | Read for all, note/contact mutations operational and server-enforced. |
| `inbox/ai-thread-banner.tsx` — `AiThreadBanner` | Shows AI auto-reply state and lets the operator pause/resume per conversation. | Loads global AI config, local busy/paused state; `/api/ai/config`, `/api/ai/autoreply/[conversationId]`; auth. | Operational action; server must authorize. Keep disabled/global-inactive distinctions clear. |

## Interactive messages

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `interactive/interactive-builder.tsx` — `InteractiveBuilder`, blank payload helpers | Controlled editor for reply-button and list message payloads. | Advanced-section local state plus controlled payload; UI controls and WhatsApp interactive/meta types. | Parent determines gate. Respect Meta count/length constraints when extending. |
| `interactive/interactive-preview.tsx` — `InteractivePreview` | Read-only WhatsApp-like preview for interactive payloads. | Payload props and utility classes. | No gate. Keep preview tolerant of incomplete drafts. |

## Layout, global listeners, and presence

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `layout/sidebar.tsx` — `Sidebar` | Primary nav, unread indicators, responsive drawer, account/role strip and user menu. | Pathname, auth, unread hooks, open state from parent; body scroll/Escape effects. | All authenticated; does not hide destinations by role. Add a primary route here and in header title mapping. |
| `layout/header.tsx` — `Header` | Page title, mobile menu trigger, mode toggle, profile menu/sign-out. | Pathname and auth profile; static title map; shared sign-out confirmation. | All authenticated. Update `PAGE_TITLES` for new sections. |
| `layout/mode-toggle.tsx` — `ModeToggle` | One-click light/dark toggle with a circular reveal from the header control. | `useTheme`, `AnimatedThemeToggler`; no remote state. | No gate. Accent selection remains in Appearance; reduced-motion and unsupported browsers use the immediate fallback. |
| `layout/account-access-alert.tsx` — `AccountAccessAlert` | Global warning for unresolved/unlinked/error account context with retry/sign-out actions. | `useAuth`, Alert/Button. | All authenticated; persistent account state intentionally remains inline rather than becoming a toast. |
| `layout/dashboard-shell-skeleton.tsx` — `DashboardShellSkeleton` | Responsive structural fallback for authenticated shell hydration, including sidebar, header and centered content. | Stateless semantic placeholders used by Boneyard. | Does not bypass auth or mount realtime listeners; generated bones require an authenticated development capture. |
| `notifications/browser-notifications-listener.tsx` — `BrowserNotificationsListener` | Headless shell adapter invoking browser-notification hook. | `useBrowserNotifications`; renders null. | Preference/permission controlled. Mount once only. |
| `presence/presence-heartbeat.tsx` — `PresenceHeartbeat` | Headless online/away heartbeat and realtime presence publication. | Auth identity, presence helpers, socket; visibility/activity lifecycle. | Authenticated. Mount once in shell to avoid duplicate heartbeats. |
| `presence/presence-dot.tsx` — `PresenceDot`, `PRESENCE_DOT_CLASS` | Visual online/away/offline indicator. | Presence status props and `cn`; stateless. | Read-only. Pair with accessible label/tooltip in consumers. |
| `themed-toaster.tsx` — `ThemedToaster` | Global Sileo renderer at top-center adapted to current mode. | `useTheme`, hydration-safe mode selection. | No gate. Keep singleton at root; feature code calls the local notification adapter. |

## Pipelines

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `pipelines/deal-card.tsx` — `DealCard` | Draggable/overlay deal summary with value/contact metadata. | Deal/stage/callback props; currency formatter. | Operational callbacks supplied by parent. Keep overlay and normal card visually aligned. |
| `pipelines/pipeline-board.tsx` — `PipelineBoard` | Stage columns and DnD deal movement, plus empty/create affordances. | Active drag id and memoized distributions; DnD, auth currency, deal cards. | Deal writes agent+ at page/API. Ensure optimistic moves reconcile with failed API calls. |
| `pipelines/deal-form.tsx` — `DealForm` | Create/edit deal sheet with pipeline stage/contact/value/details. | Controlled form/loading/resources; `/api/pipelines/resources` and nested deal endpoint; auth currency. | Operational. Currency is account-derived; preserve contact lookup contract. |
| `pipelines/pipeline-analytics.tsx` — `PipelineAnalytics` | Stage totals/counts/conversion visualization. | Stage/deal props; auth currency, tooltip. | Read-only. Define conversion denominator when adding analytics. |
| `pipelines/pipeline-settings.tsx` — `PipelineSettings` | Rename/delete pipeline and CRUD/color stages. | Local name/stages/new-stage/save/delete/dialog state; `/api/pipelines/[id]` and stage endpoints. | Workspace admin in page. Avoid deleting/moving stages without explicit deal handling. |

## Settings

| File / exports | Responsibility | Dependencies and state/data | Permissions / extension notes |
|---|---|---|---|
| `settings/settings-sections.ts` — section constants/meta/resolver | Canonical settings information architecture and `?tab=` validation. | Static Lucide metadata; no state. | Rail/page decide access. Add a section here, page panel map and overview links together. |
| `settings/settings-rail.tsx` — `SettingsRail` | Grouped responsive settings navigation with active state/hints. | Controlled active/onSelect/hints; metadata and `cn`. | Parent determines visible sections. |
| `settings/settings-overview.tsx` — `SettingsOverview` | Landing cards for profile/account/counts/WhatsApp/theme/currency with section shortcuts. | `/api/settings/overview`, `/api/whatsapp/config`; auth/theme; independent loading state. | Read for all; destination panels enforce mutations. |
| `settings/settings-panel-head.tsx` — `SettingsPanelHead` | Consistent settings panel icon/title/description header. | Props and `cn`; stateless. | No gate. |
| `settings/settings-chip.tsx` — `SettingsChip`, `StatusDot` | Compact metadata/status display. | Props and `cn`; stateless. | No gate; pair dot with text. |
| `settings/profile-form.tsx` — `ProfileForm` | Current user name/avatar update/removal. | Local text/file/preview/remove/save state; auth client, `/api/account`, `refreshProfile`. | User may edit own profile. Revoke preview URLs and refresh context after save. |
| `settings/password-form.tsx` — `PasswordForm` | Current/new/confirmation password change. | Form/loading/error state; Better Auth client. | Signed-in user. Keep minimum/match/server errors inline. |
| `settings/sessions-card.tsx` — `SessionsCard` | List/revoke active Better Auth sessions with action confirmation. | Session list/pending state; auth client and shared SweetAlert2 adapter. | Signed-in user. Revoking all sessions signs out and hard-navigates to login. |
| `settings/security-panel.tsx` — `SecurityPanel` | Composition of password and sessions cards. | Stateless wrapper. | Signed-in user. |
| `settings/appearance-panel.tsx` — `AppearancePanel` | Mode and accent picker; mode cards use the same origin-aware animated reveal as the header. | `useTheme`, `AnimatedThemeToggler`, theme catalog; controlled by provider. | Device-local for all users. Add accents through theme source/token sheet. |
| `settings/browser-notifications-card.tsx` — `BrowserNotificationsCard` | Browser permission and device preference control. | Permission/preference/subscription UI state; browser notification helpers. | Device-local; no account-role gate. Handle unsupported/denied/granted separately. |
| `settings/whatsapp-config.tsx` — `WhatsAppConfig` | Configure/test/reset Meta credentials, webhook/register status and inbound media mirroring. | Extensive loading/save/test/reset/token visibility/registration/config state; WhatsApp config endpoints; accordion/alert/forms/auth. | Workspace admin by server/policy; UI consumes auth. Never expose stored secret values; preserve “unchanged token” semantics. |
| `settings/template-manager.tsx` — `TemplateManager` | List/create/edit/delete/sync/submit WhatsApp templates and media headers. | Templates/dialog/form/edit/delete/upload/sync state; template and WhatsApp endpoints; upload/validators/status helpers. | Workspace admin. Keep Meta component constraints, upload type and status normalization synchronized. |
| `settings/quick-replies-manager.tsx` — `QuickRepliesManager` | CRUD reusable text or interactive quick replies. | Items/loading/draft/save state; `/api/quick-replies`; interactive builder. | Workspace data; server authorization applies. Preserve payload type compatibility with picker/composer. |
| `settings/custom-fields-settings.tsx` — `CustomFieldsSettings` | Card wrapper around contact custom-field panel. | `CustomFieldsPanel`; no own state. | Workspace admin through parent/panel policy. |
| `settings/tag-manager.tsx` — `TagManager` | Tag list and create/edit/delete dialog. | Local list/draft/save/delete state; `/api/tags`; auth/UI controls. | Workspace admin. Account-scoped uniqueness/color rules belong server-side. |
| `settings/fields-and-tags-panel.tsx` — `FieldsAndTagsPanel` | Composes tag and custom-field managers with read-only behavior. | `useCan('edit-settings')`. | Explicit admin+ edit capability. Pass gate consistently to both child managers. |
| `settings/deals-settings.tsx` — `DealsSettings` | Set account default deal currency. | Selected/save state; auth default; `PATCH /api/pipelines/settings`. | Workspace admin by API/policy. Refresh auth/account data if consumers must update immediately. |
| `settings/members-tab.tsx` — `MembersTab` | Member/invitation roster, presence, role changes, remove/revoke actions. | Members/invitations/loading/dialog/pending state; member/invitation APIs; auth, presence, role helpers. | List visible; admin actions wrapped in `RequireRole min="admin"`; owner constraints are reflected in controls. Preserve last-owner and self-action protections server-side. |
| `settings/invite-member-dialog.tsx` — `InviteMemberDialog` | Create invitation with role, expiry and label; reveal/copy the one-time URL through SweetAlert2. | Local form/submitting state; `/api/account/invitations`; auth and one-time-secret helper. | Opened from admin-gated parent. Plaintext URL is not retained in page state/HTML after acknowledgement. |
| `settings/api-keys-settings.tsx` — `ApiKeysSettings` | List scopes/last use, create key once, revoke key, show API examples. | Keys/loading/form/revoke/create/scope state; account API-key endpoints, scope metadata and action-alert helpers. | Listing available in panel; create/revoke wrapped admin+. Plaintext is revealed in a non-dismissible SweetAlert2 DOM node and cleared after acknowledgement. |
| `settings/ai-config.tsx` — `AiConfig` | AI provider/model/key/system prompt/auto-reply/limits/handoff configuration and connectivity test. | Extensive config/key visibility/loading/test/member state; `/api/ai/config`, `/api/ai/test`; account members/defaults/types. | Configuration should be admin+ server-side; usage parent separately gates analytics. Keep stored keys masked and provider/model defaults centralized. |
| `settings/ai-knowledge.tsx` — `AiKnowledgeCard` | CRUD knowledge documents and trigger reindex. | Docs/loading/edit/title/content/save/reindex state; AI knowledge endpoints. | Workspace-admin-style operation; API enforces. Expose indexing failures distinctly from document save failures. |
| `settings/role-meta.ts` — `ROLE_META` | Shared labels/descriptions/styles for account roles. | Pure role map. | Keep aligned with `src/lib/auth/roles` and invitation/member UI. |

## Tremor chart utilities

| File / exports | Responsibility | Dependencies/state | Extension notes |
|---|---|---|---|
| `tremor/bar-chart.tsx` — chart exports | Recharts-based bar chart, legend, tooltip, scroll and interaction layer. | Recharts, React pressed/scroll/legend/active-bar state, resize helper and `cn`. | Treat as shared infrastructure; test keyboard, narrow viewport, legend and stacked/category modes. |
| `tremor/chart-colors.ts` — color helpers | Semantic chart palette and category/class lookup. | Pure maps/functions. | Add colors with all required fill/stroke/text/background mappings. |
| `tremor/get-y-axis-domain.ts` — `getYAxisDomain` | Calculates padded Y-axis bounds. | Pure numeric helper. | Preserve zero/negative edge cases. |
| `tremor/use-on-window-resize.ts` — `useOnWindowResize` | Window resize event hook used by charts. | Effect/subscription. | Keep stable handler behavior and cleanup. |

## UI primitives

These are stateless or internally controlled accessible wrappers; they do not fetch data or apply product permissions. All merge classes through `cn()` and should remain the only direct Base UI adaptation layer.

| File | Exports / purpose |
|---|---|
| `ui/accordion.tsx` | Accordion root/item/trigger/content. |
| `ui/alert.tsx` | Alert, title, description, action. |
| `ui/animated-theme-toggler.tsx` | Controlled light/dark button with a circular View Transitions reveal and accessible fallback. |
| `ui/avatar.tsx` | Avatar, image, fallback. |
| `ui/badge.tsx` | Badge and variant function. |
| `ui/button.tsx` | Button and variant function. |
| `ui/card.tsx` | Card composition parts. |
| `ui/checkbox.tsx` | Checkbox and indicator behavior. |
| `ui/dialog.tsx` | Modal root/portal/overlay/content and semantic composition parts. |
| `ui/dropdown-menu.tsx` | Menu items, groups, checkbox/radio items, submenus, separators and shortcut. |
| `ui/gated-button.tsx` | Permission-aware disabled button wrapper; accepts `canAct` and gate reason. |
| `ui/input.tsx` | Standard input. |
| `ui/label.tsx` | Form label. |
| `ui/popover.tsx` | Anchored popover composition. |
| `ui/scroll-area.tsx` | Styled scroll area/bar. |
| `ui/select.tsx` | Select/listbox composition and scroll controls. |
| `ui/sheet.tsx` | Side sheet composition. |
| `ui/switch.tsx` | Boolean switch. |
| `ui/table.tsx` | Semantic table composition. |
| `ui/tabs.tsx` | Tabs/list/trigger/content and list variants. |
| `ui/textarea.tsx` | Multiline input. |
| `ui/tooltip.tsx` | Provider/root/trigger/content. |

Detailed token and primitive guidance is in [design-system.md](../arquitecture/design-system.md).

## Adding or changing components

1. Prefer composition from `src/components/ui` and semantic tokens.
2. Keep remote data at the nearest stable feature boundary; do not make purely presentational children refetch parent data.
3. Represent loading, empty, error, read-only and mutation-pending states explicitly.
4. Gate UX with capabilities and enforce authorization in APIs.
5. For sockets/DOM/object URLs/recorders, implement exact cleanup.
6. When adding a domain type (message, node, automation step, template component), update renderer, editor, validator, serializer and server contract together.
7. Add the new file/export to this catalog.
