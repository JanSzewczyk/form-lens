# Design system report: sidebar toggle and icon rail

For `@szum-tech/design-system` (read from the installed package, `dist/chunk-62XFAU6W.js` and `dist/components/sidebar`).
The Studio now uses the DS parts as they are and works around nothing. These are the changes that would remove the
need for per-project fixes.

## 1. `SidebarTrigger` reports no state (accessibility, WCAG 4.1.2)

**Today.** The trigger renders `Button` (ghost, `icon-sm`) with a `PanelLeftIcon` and
`<span class="sr-only">Toggle Sidebar</span>`. It sets `data-sidebar="trigger"` and `data-slot="sidebar-trigger"` and
calls `toggleSidebar()`. It sets no `aria-expanded` and no `aria-controls`, so a screen reader cannot tell whether the
navigation is open. The label is a fixed English string.

**Change.**
- Set `aria-expanded` from the context: `isMobile ? openMobile : open` (`useSidebar()` already has both).
- Set `aria-controls` to the id of the sidebar element (give `Sidebar` a stable `id` via `React.useId()` in the
  provider, or accept an `id` prop).
- Optional `label` prop (default `"Toggle Sidebar"`) for translation.
- Keep composing a consumer `onClick` as today.

Consumers had to wrap the trigger in a client component (`aria-expanded={isMobile ? openMobile : open}`) in every
project. Owner's decision for the Studio: use the plain trigger and accept the gap until the DS fixes it.

## 2. Icon rail (`collapsible="icon"`) needs per-project classes

`Sidebar collapsible="icon"` works well: the width becomes `--sidebar-width-icon`, `SidebarMenuButton` shrinks to
`size-8`, and its `tooltip` prop shows the label. What every project has to add by hand:

- **Header and footer padding.** `SidebarHeader` and `SidebarFooter` keep their padding in icon mode. Default to
  `group-data-[collapsible=icon]:p-2`.
- **Labels in custom header content.** A logo with a text label needs `group-data-[collapsible=icon]:hidden` on the
  text. Consider exporting a small `SidebarLabel` (hidden in icon mode) or documenting the class.
- **Status or footer content.** Same pattern; the Studio hides the host line and keeps the status dot, with the
  label `sr-only`. A documented `SidebarFooter` example with an icon-only state would save the guesswork.
- **Docs and stories.** Add an `icon` collapsible story with `tooltip` on every menu button and a header with a logo.

## 3. Vertical `Separator` in a flex row (visual)

Observed in the Studio header (`items-center` flex row with the trigger, the separator and breadcrumbs): the vertical
`Separator` rendered about 20 px high, a short stub beside taller siblings. The fix that worked is
`data-[orientation=vertical]:h-auto data-[orientation=vertical]:self-stretch`. Make a vertical `Separator` stretch to
the row by default (`self-stretch`, `h-auto`), or document it. Not verified against the DS source.

## 4. Storybook a11y

The Studio's Storybook runs the a11y addon with `test: "todo"`, so axe violations never fail a test; the missing
`aria-expanded` above would be caught by a DS-level story that asserts it on the trigger.

## 5. `SortableItem` is a `role="button"` that wraps interactive controls (WCAG 4.1.2, axe `nested-interactive`)

Found by the SDD review (static accessibility audit and the Playwright run). The sortable item root renders
`div role="button" tabindex="0" aria-describedby=…` and the consumer puts inputs and buttons inside it (the Studio's
field rows: key, description, type, required, move up, move down, remove). Interactive controls inside a
`role="button"` are not reachable as separate controls for assistive technology, and the row's accessible name becomes
its whole content (a Playwright `getByRole("button", { name: "Move field 1 down" })` matched both the root and the
inner button).

**Change.** Keep the drag listeners and `tabIndex` on a dedicated drag-handle element (a real `button` with
`aria-label`, as the Studio already adds) and render the item root as a plain element (`div`, `li`) without `role` or
`tabindex`, or let the consumer choose the handle with an `asHandle` or `Sortable.Handle` part. The keyboard drag
sensor then attaches to the handle only.

## 6. Tooltip `aria-describedby` repeats the accessible name

Observed in the Studio's collapsed icon rail (a tooltip on a link whose accessible name is already the tooltip text).
The Radix tooltip trigger sets `aria-describedby` to the tooltip content, which also holds the label, so a screen
reader may announce the name twice. The DS `SidebarMenuButton` `tooltip` prop behaves the same. Change: when the
tooltip text equals the trigger's accessible name, do not set `aria-describedby` (or mark the tooltip content
`aria-hidden` for that case). Not tested with a screen reader.
