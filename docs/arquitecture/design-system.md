# Frontend design system

> Source of truth: `src/app/globals.css`, `src/lib/themes.ts`, `src/hooks/use-theme.tsx`, and `src/components/ui`.

## Related documentation

- [Frontend architecture](./frontend.md)
- [Component catalog](../modules/components.md)
- [Page catalog](../modules/pages.md)
- [Hook catalog](../modules/hooks.md)

## Design principles visible in the implementation

- **Semantic before literal:** feature components use `background`, `card`, `muted`, `primary`, `destructive`, etc., not a fixed brand palette for normal surfaces.
- **Two independent theme axes:** neutral light/dark mode and accent selection compose freely.
- **Graphite dark identity:** dark mode uses near-black neutral surfaces, restrained one-pixel boundaries, and high-contrast controls inspired by Better Auth's utilitarian visual language; accent color is reserved for focus, status, selection, and data.
- **Local primitives:** Base UI behavior is wrapped under `src/components/ui`; feature code imports these wrappers instead of `@base-ui/react` directly.
- **Progressive density:** cards and tables are compact on desktop while touch targets and page padding increase usability on mobile.
- **Status is redundant:** labels and icons accompany color for campaign, automation, flow, presence, and validation states.
- **Read-only is explicit:** permission-sensitive actions are gated or disabled rather than silently failing.

## Theme architecture

The root `<html>` carries:

- `data-mode="light|dark"` for neutral surfaces;
- `data-theme="violet|emerald|cobalt|amber|rose"` for the accent palette.

`src/app/layout.tsx` emits defaults and runs a `beforeInteractive` boot script that validates local-storage values and applies both attributes before hydration. `ThemeProvider` then owns runtime state, persists changes, updates the attributes, and listens for cross-tab `storage` events. Interactive mode controls use the local `AnimatedThemeToggler` primitive, adapted from Magic UI, to reveal the new palette with the View Transitions API from the pressed control. The behavior progressively falls back to an immediate change when the API is unavailable and always skips animation for `prefers-reduced-motion: reduce`.

| Axis | Values | Default | Storage key |
|---|---|---|---|
| Mode | `light`, `dark` | `dark` | `furyleeds.mode` |
| Accent | `violet`, `emerald`, `cobalt`, `amber`, `rose` | `violet` | `furyleeds.theme` |

The FuryLeeds rebrand intentionally changes these browser keys. Existing device-local appearance preferences under the retired namespace are not read or migrated; users receive the documented defaults once and can select preferences again.

Accent metadata, picker labels, ordering, and static swatches live in `src/lib/themes.ts`. Actual tokens live in `globals.css`.

## Semantic tokens

Tailwind v4 mappings are declared with `@theme inline`; feature classes such as `bg-card`, `text-muted-foreground`, and `ring-ring` resolve through these variables.

### Neutral/surface tokens (mode-owned)

| Token | Intended use |
|---|---|
| `--background` / `--foreground` | Page canvas and default text |
| `--card` / `--card-foreground` | Primary panels, cards, menus |
| `--card-2` | Secondary tile or hover surface |
| `--popover` / `--popover-foreground` | Dialog/menu/popover surfaces |
| `--secondary` / `--secondary-foreground` | Secondary controls |
| `--muted` / `--muted-foreground` | Low-emphasis surfaces and copy |
| `--accent` / `--accent-foreground` | Neutral interactive hover/selection |
| `--destructive` | Destructive actions and errors |
| `--border` / `--input` | Boundaries and control outlines |
| `--chart-2` … `--chart-5` | Non-primary chart series |
| `--sidebar*` | Sidebar surface, border, foreground, and neutral accent |
| `--radius` | Base radius (`0.625rem` in both modes) |

### Accent tokens (theme-owned)

| Token | Intended use |
|---|---|
| `--primary` / `--primary-foreground` | Main action and selected state |
| `--primary-hover` | Explicit primary hover color |
| `--primary-soft` / `--primary-soft-2` | Tinted panels, pills, active navigation |
| `--ring` | Focus ring |
| `--chart-1` | Primary chart series |
| `--sidebar-primary*`, `--sidebar-ring` | Active sidebar treatment |

Do not place neutral surface values in accent blocks or primary values in mode blocks; their disjoint ownership is what permits every accent/mode combination.

## Typography

- Inter is loaded by Next and assigned to `--font-sans`; the entire document uses it.
- `--font-heading` currently aliases the sans family.
- `--font-mono` maps to `--font-geist-mono`, but the root layout does not itself load Geist Mono; code-like labels still request `font-mono` where useful.
- Common hierarchy in pages: `text-2xl font-bold` page title, `text-sm text-muted-foreground` supporting copy, and compact `text-xs` metadata.
- The application language and visible copy are predominantly Spanish even though source identifiers and documentation are primarily English.

## Shape, spacing, and layout

Tailwind radius aliases derive from `--radius` (`sm` through `4xl`). Product panels commonly use `rounded-lg border border-border bg-card` with restrained dark shadows; nested controls use `rounded-md`. Inputs and default buttons are 36px high, while auth primary actions explicitly use 40px for prominence.

Layout conventions:

- authenticated content uses `p-4 sm:p-6` inside a scrollable main region;
- the header is 56px (`h-14`);
- sidebar width is 256px on mobile and 240px at `lg`;
- feature pages use `space-y-5`/`space-y-6` and responsive grids;
- dialogs/sheets are used for focused edits, while destructive actions require confirmation;
- mobile nav controls target approximately 40–44px.

## Base UI custom variants

`globals.css` defines Tailwind custom variants matching Base UI state attributes:

- `data-open`, `data-closed`
- `data-checked`, `data-disabled`, `data-active`
- `data-horizontal`, `data-vertical`
- `dark` via an ancestor carrying `.dark`

The application’s actual light/dark colors are selected by `data-mode`; the `dark` variant remains available for components that need dark-specific readability classes.

## Primitive inventory

All primitives use `cn()` to merge caller classes with defaults. Most wrap Base UI and preserve `data-slot` hooks for targeted styling.

| File | Exports / responsibility |
|---|---|
| `ui/accordion.tsx` | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`; collapsible sections with animated height keyframes. |
| `ui/alert.tsx` | `Alert`, `AlertTitle`, `AlertDescription`, `AlertAction`; semantic notice layout and variants. |
| `ui/animated-theme-toggler.tsx` | `AnimatedThemeToggler`; controlled light/dark button with a circular View Transitions reveal, unsupported-browser fallback, and reduced-motion handling. |
| `ui/avatar.tsx` | `Avatar`, `AvatarImage`, `AvatarFallback`; profile/media identity with fallback. |
| `ui/badge.tsx` | `Badge`, `badgeVariants`; compact semantic labels. |
| `ui/button.tsx` | `Button`, `buttonVariants`; shared sizes/variants and disabled/focus behavior. |
| `ui/card.tsx` | `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardAction`, `CardDescription`, `CardContent`; panel composition. |
| `ui/checkbox.tsx` | `Checkbox`; checked/disabled behavior and indicator. |
| `ui/dialog.tsx` | Dialog root, trigger, portal, close, overlay, content, header/footer/title/description; modal composition. |
| `ui/dropdown-menu.tsx` | Dropdown root/portal/trigger/content/groups/items/checkbox/radio/labels/separators/submenus/shortcut; action menus. |
| `ui/gated-button.tsx` | `GatedButton`; wraps `Button`, disables unauthorized actions, and exposes the gate reason. |
| `ui/input.tsx` | `Input`; standard text-like control. |
| `ui/label.tsx` | `Label`; form labeling. |
| `ui/popover.tsx` | Popover root, trigger, portal, content, anchor, title, description, close; anchored overlays. |
| `ui/scroll-area.tsx` | `ScrollArea`, `ScrollBar`; styled overflow viewport. |
| `ui/select.tsx` | Select root/value/trigger/content/groups/items/labels/separators and scroll controls; listbox selection. |
| `ui/sheet.tsx` | Sheet root/trigger/close/content/header/footer/title/description; side-panel editing/detail. |
| `ui/switch.tsx` | `Switch`; boolean toggle. |
| `ui/table.tsx` | Table, header/body/footer/head/row/cell/caption; responsive semantic data-table parts. |
| `ui/tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `tabsListVariants`; sectional navigation. |
| `ui/textarea.tsx` | `Textarea`; multiline control. |
| `ui/tooltip.tsx` | `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`; contextual labels/help. |
| `auth/auth-page-shell.tsx` | `AuthPageShell`; shared graphite background, FuryLeeds identity, login/signup navigation, panel and protected-access context for all public identity flows. |

See [components.md](../modules/components.md) for feature-level consumers and permissions.

## Charts and data visualization

`src/components/tremor` is the local chart foundation:

- `bar-chart.tsx` wraps Recharts into `BarChart` and `BarList`-style exports with legends, tooltips, keyboard/scroll behavior, and active-series state.
- `chart-colors.ts` maps semantic chart color names to Tailwind classes and builds category color assignments.
- `get-y-axis-domain.ts` computes a padded axis range.
- `use-on-window-resize.ts` supplies resize subscription behavior.

Dashboard components add product-specific formatting and empty/loading states. `ConversationsChart` is custom SVG/state logic; `ResponseTimeChart` uses the Tremor bar chart; `PipelineDonut` renders the deal funnel distribution.

## Authentication visual shell

`AuthPageShell` is the only full-page visual wrapper for login, signup, password recovery/reset, and invitation redemption. It provides a subtle technical grid, one external FuryLeeds mark, restrained ambient light, a bordered graphite panel, and optional login/signup tabs. Forms must not repeat the product logo inside the panel. Login and signup headings are centered and use a stronger `text-2xl` hierarchy; primary submit actions are neutral high-contrast rather than accent-filled, while focus remains tied to the selected accent token.

## Feedback and status patterns

- `ThemedToaster` mounts Sileo once at the root in `top-center`, follows the selected light/dark mode, and is called through `src/lib/notifications.ts` for ephemeral success/error/warning/info feedback.
- SweetAlert2 is dynamically imported through `src/lib/action-alerts.ts` only for action confirmations and one-time secret reveals. It uses semantic FuryLeeds tokens, safe text/DOM insertion, cancel-first destructive focus, and non-dismissible one-time reveals.
- Inline `role="alert"` blocks remain for persistent account/security state and form errors that require local correction; they are not replaced by ephemeral feedback.
- Status chips use borders plus tinted backgrounds and text; domain mappings stay near their feature (`broadcast-status`, automation trigger/status metadata, flow status maps, role metadata).
- Initial authenticated-shell loading uses Boneyard with a structural sidebar/header/centered-content fallback; generated responsive bones may replace the fallback after an authenticated capture. Feature-level transitions may retain focused spinners or domain-specific skeletons.
- Empty states use muted copy, dashed borders, and a contextual next action.
- Presence uses labeled/tooltip-capable dots with separate `online`, `away`, and `offline` styles.

## Accessibility conventions

Implemented patterns include:

- semantic buttons/links and form labels;
- `aria-label` on icon-only controls;
- `sr-only` descriptions for unread indicators and live status dots;
- visible focus/ring tokens inherited by primitives;
- Escape/backdrop behavior and scroll locking for the mobile sidebar;
- modal titles/descriptions through Base UI wrappers;
- color paired with labels/icons rather than used alone;
- sufficient mobile hit areas in the main shell.

When extending a primitive, preserve Base UI semantics, keyboard behavior, focus return, and `data-*` state attributes. When extending a feature, verify both light/dark mode and all five accents; hard-coded status colors should remain readable in both modes.

## Extension procedures

### Add an accent theme

1. Add a complete `html[data-theme="id"]` accent block in `src/app/globals.css`, using Violet as the required token shape.
2. Add the id to `THEME_IDS` and metadata to `THEMES` in `src/lib/themes.ts`.
3. Keep the swatch equal to the CSS `--primary` value.
4. Test light and dark modes, focus rings, primary foreground contrast, charts, and sidebar selection.

### Add a semantic token

1. Decide whether it belongs to mode (neutral) or accent (brand); never define it in both dimensions without a deliberate composition rule.
2. Define it in every relevant mode/accent block.
3. Map it in `@theme inline` to expose a Tailwind utility.
4. Prefer a semantic name describing purpose rather than a color name.

### Add a primitive

1. Place it in `src/components/ui` and wrap Base UI where an accessible behavior primitive exists.
2. Accept/merge `className` through `cn()` and forward native props.
3. Expose subcomponents explicitly and keep variants typed.
4. Use semantic tokens only.
5. Document it in this inventory and [components.md](../modules/components.md).
