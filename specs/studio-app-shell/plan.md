# Plan: Studio App Shell

**Spec:** `specs/studio-app-shell/spec.md`
**Status:** tasks-ready

## High-level approach

**API first (contract).** `GET /v1/templates` gets an optional `search` (case-insensitive substring of `name`,
SQL `lower(name) LIKE lower(:q)` with `%`/`_` escaped; `total` counts matches). Each template gets `last_used_at`, kept as a
**column on `templates`**. Extractions set it through the existing `TemplateCatalog` port (`mark_used`) after
`submit` stores the extraction. The rejected alternative was computing `MAX(extractions.created_at)` through a templates port: it adds
a query on every list, and the date disappears when old extractions are purged. The templates module still never reads the extractions
table, so the import-linter layering stays as it is. `api-v0.1.0` is released, so the column comes in a new migration `v0002`, which backfills it
from `extractions` (`MAX(created_at)` per `template_id`). `PUT` keeps `last_used_at`; `mark_used` on a deleted template is
a no-op. A template that was never used gets `null`.

**Studio.** A route group `app/(shell)/` with one layout that renders the shell. It uses the DS `Sidebar*` for the collapsible
navigation (Forms, New document, Jobs; the current item comes from the pathname), DS `Header` with `SidebarTrigger`,
`Breadcrumb` and the existing `ThemeToggle`, and an API status box. The status box gets its first state on the server
(`checkApiHealth()` → the API's `GET /health/ready`) and then a client component polls the Studio route
`GET /api/formlens-status` every 60 s (paused while `document.hidden`, one check on `visibilitychange`). The API
client stays server-only, and the browser never calls the API directly or learns more than `{ status, host }`.
The rejected alternative was calling the API from the browser: it breaks the server-only client rule and needs CORS. `/` redirects to `/forms`. Routes: `/forms` (list), `/forms/new`, `/forms/[id]/edit`,
`/documents/new` and `/jobs` (placeholders). Pages are Server Components and load data through `features/templates/server/*`.
Mutations are Server Actions that return the typed `ActionResponse`. The editor is one client component on
**react-hook-form + Zod** (`useFieldArray`, DS `Sortable` for reorder, `watch` for the live JSON preview). The same
Zod schema validates in the browser and again in the action. API Problem Details are mapped to field and form errors in
`map-service-error.ts`, with Polish user text as the constitution requires. After a successful create or save the action redirects to `/forms`, and a DS
`Toaster` shows "Form created" or "Form saved". Search and paging live in URL search params (`?q=`, `?page=`), so the list stays
a Server Component and links are shareable. The rejected alternative was client-side fetching. Design tokens (Poppins, JetBrains Mono, radius,
sidebar colors) come from the DS theme in `app/globals.css`, so the Studio does not define its own palette.

## Contracts

- **HTTP** `GET /v1/templates?search=&limit=&offset=` → 200 `TemplatePage` (unchanged shape). `TemplateResponse` gains
  `last_used_at: datetime | null`. The change is additive, so oasdiff reports no breaking change.
- **Port** `TemplateCatalog.mark_used(template_id: UUID, at: datetime) -> None` (extractions domain). It is provided by
  `TemplateServiceCatalog` → `TemplateService.mark_used` → `TemplateRepository.mark_used`.
- **Migration** `v0002`: `templates.last_used_at` nullable `DateTime(timezone=True)`, plus the backfill.
- **Generated client**: `make openapi` regenerates `apps/api/openapi.json`, and `npm run generate -w @form-lens/api-client` regenerates the client. `ListTemplatesParams.search` and
  `TemplateResponse.last_used_at` are new.
- **Studio** `features/templates/schemas/template-form-schema.ts` is the Zod schema of the editor. The editor form, the
  actions and the request mapping all share it.

## File-by-file change list

### api (backend · apps/api)
- `src/formlens/templates/tables.py` — `last_used_at` column on `TemplateRow`
- `src/formlens/migrations/versions/v0002_template_last_used.py` — add the column and backfill it from `extractions` [**contract**]
- `src/formlens/templates/models.py` — `Template.last_used_at: datetime | None`
- `src/formlens/templates/repository.py` — `page(search=…)` with an escaped case-insensitive LIKE, `mark_used`, and `replace` keeps `last_used_at` (reuses `SqliteTemplateRepository.page`)
- `src/formlens/templates/service.py` — `page(search, limit, offset)`, `mark_used(template_id, at)` (a no-op when the template is missing)
- `src/formlens/templates/schemas.py` — `TemplateResponse.last_used_at` [**contract**]
- `src/formlens/templates/router.py` — `search: str | None = Query(None, max_length=100)` on `list_templates` (pattern: `extractions/entrypoints/router.py:99`) [**contract**]
- `src/formlens/extractions/domain/ports.py` — `TemplateCatalog.mark_used` [**contract**]
- `src/formlens/extractions/adapters/template_catalog.py` — `mark_used` delegates to `TemplateService`
- `src/formlens/extractions/service_layer/service.py` — `submit` calls `catalog.mark_used(template_id, now)` after `repository.add`
- `openapi.json` — regenerated with `make openapi`
- `tests/templates/test_api.py` — AC22 (search: matches, case, `%`/`_` taken literally, `total`), `last_used_at` null for a new template and kept by `PUT` (reuses the `create()` helper, `:252-300` list tests)
- `tests/templates/test_repository.py` (or the existing repository tests) — `mark_used`, search escaping
- `tests/extractions/fakes.py` — `FakeTemplateCatalog.mark_used` records the calls
- `tests/extractions/test_service.py` — `submit` marks the template used with the clock time, and does not when `add` fails
- `tests/extractions/test_api.py` — AC23 end to end: submit an extraction → the template's `last_used_at` equals its `created_at`
- `tests/test_migrations.py` (existing migration test, or a new one) — `v0002` upgrade backfills and downgrade drops the column
- `README.md` — mention `search` in the template route table row

### @form-lens/api-client (library · packages/api-client)
- `src/generated/**` — regenerated, never by hand
- `src/index.test.ts` — `listTemplates({ search: "inv" })` puts `search` in the URL (extends `:33`)

### @form-lens/studio (web · apps/studio)
- `package.json` — add `react-hook-form` and `@hookform/resolvers` (`npm install … -w @form-lens/studio`)
- `app/globals.css` — DS theme import, Poppins and JetBrains Mono font variables, and the sidebar tokens as the design uses them
- `app/layout.tsx` — fonts and the DS `Toaster` (keeps `ThemeProvider`)
- `app/page.tsx` — `redirect("/forms")` (replaces the current list page)
- `app/(shell)/layout.tsx` — the shell: `SidebarProvider`, `AppSidebar`, `AppHeader`, `<main id="main-content">`
- `components/layout/app-sidebar.tsx` — logo, navigation items with `aria-current`, and the `ApiStatus` slot (client part only for the active item)
- `components/layout/app-sidebar.stories.tsx` — AC1, AC2 (toggle collapses and expands, `aria-expanded`), the active item
- `components/layout/app-header.tsx` — `SidebarTrigger`, `Breadcrumb` from a `breadcrumbs` prop, `ThemeToggle` (reuses `components/ui/theme-toggle.tsx:38`)
- `components/layout/api-status.tsx` — Server Component: the initial `checkApiHealth()` result passed to `ApiStatusLive` (AC3)
- `components/layout/api-status-live.tsx` — client: renders the DS `Status` (connected/unavailable plus host) and polls `/api/formlens-status` every 60 s, paused while the tab is hidden, rechecks on `visibilitychange`, and clears the timer on unmount (AC25)
- `components/layout/api-status-live.stories.tsx` — both states; a play test with mocked `fetch` and fake timers checks that the status flips after one interval and that no request is made while hidden
- `app/api/formlens-status/route.ts` — `GET`: `checkApiHealth()` → `{ status: "connected" | "unavailable", host }`, `Cache-Control: no-store` [**contract**: consumed by `api-status-live.tsx`]
- `app/api/formlens-status/route.test.ts` — both results, no-store header
- `lib/api-health.ts` — `checkApiHealth()` calls `GET /health/ready` with a 3 s timeout and never throws (pattern: `features/templates/server/load-templates.ts:10`)
- `lib/api-health.test.ts` — ok, error status, network failure, timeout
- `app/(shell)/forms/page.tsx` — list page: header, search form (GET `?q=`), count, cards, "New form" tile, pager; AC6–AC11
- `app/(shell)/forms/loading.tsx` — skeleton cards
- `app/(shell)/forms/new/page.tsx` — create page (`TemplateEditor` in create mode)
- `app/(shell)/forms/[id]/edit/page.tsx` — edit page, `notFound()` on 404 (AC21)
- `app/(shell)/forms/[id]/not-found.tsx` — "Form not found" with a link back to Forms
- `app/(shell)/documents/new/page.tsx`, `app/(shell)/jobs/page.tsx` — placeholders: "Coming soon" `Empty` (AC4)
- `features/templates/server/load-templates.ts` — takes `{ search, page }`, maps to `limit`/`offset`, and returns `total` (extends the current function)
- `features/templates/server/load-templates.test.ts` — search and page mapping (extends the 3 existing cases)
- `features/templates/server/load-template.ts` (+ `.test.ts`) — one template, or `not-found`, or `unavailable`
- `features/templates/server/template-actions.ts` — `createTemplate`, `updateTemplate`, `deleteTemplate` Server Actions: Zod parse, API call, `revalidatePath("/forms")`, redirect
- `features/templates/server/template-actions.test.ts` — validation refusal, API 422/400 mapped to field errors and input kept (AC19), 404 on update or delete
- `features/templates/server/map-service-error.ts` (+ `.test.ts`) — Problem Details → `ActionResponse` errors with Polish messages
- `features/templates/schemas/template-form-schema.ts` — Zod schema: name 1–100, description ≤ 300, fields 1–50, unique keys, `choice` needs 1–50 values, min/max only for number and integer, pattern only for text [**contract**]
- `features/templates/schemas/template-form-schema.test.ts` — AC13–AC15 and the limits
- `features/templates/utils/template-mapping.ts` (+ `.test.ts`) — form values ↔ API `TemplateCreate`/`TemplateResponse` (keeps min/max/pattern), JSON preview from the fields (AC16)
- `features/templates/components/template-card.tsx` (+ `.stories.tsx`) — name, description, "N fields" badge, "Last used …" or "Never used", Use form and Edit actions
- `features/templates/components/template-list.tsx` — the grid of cards, the "New form" tile, the empty and no-match states (replaces the current list)
- `features/templates/components/template-list.stories.tsx` — AC6, AC7, AC10, no-match
- `features/templates/components/template-search.tsx` — search input that submits `?q=`
- `features/templates/components/template-pager.tsx` — previous and next links from `page`/`total` (AC9)
- `features/templates/components/template-editor.tsx` — client: react-hook-form, the Basic information card, the Fields card, preview, Cancel/Create/Save, Delete (edit mode)
- `features/templates/components/field-row.tsx` — key, description, type `Select`, required `Switch`, allowed values for choice, "Advanced" `Collapsible` with min/max/pattern, remove, drag handle
- `features/templates/components/response-preview.tsx` — the JSON shape from the watched fields
- `features/templates/components/delete-template-dialog.tsx` — DS `AlertDialog` confirmation (AC20)
- `features/templates/components/template-editor.stories.tsx` — create empty state, edit filled (AC17), add/remove/reorder updates the preview (AC16), choice without values refused (AC15), duplicate keys (AC14), phone width (AC24)
- `tests/e2e/main-page.e2e.ts` → `tests/e2e/forms.e2e.ts` — happy path against a running API: navigation, create → list → edit → delete
- `knip.json` — only if the new route group or story files need an entry

## Risks & mitigations

- **Risk:** `submit` stores the extraction and `mark_used` writes in a second transaction, so a crash between the two leaves `last_used_at` stale. **Mitigation:** acceptable for a display date. `mark_used` runs after `add` succeeds, so a refused extraction never marks the template.
- **Risk:** a user-typed `%` or `_` in `search` acts as a wildcard. **Mitigation:** escape both with `ESCAPE '\'`, covered by the API test.
- **Risk:** DS `Sidebar` may not match the design's 248 px aside or collapse behavior out of the box. **Mitigation:** set the width through the `SidebarProvider` style variable. If the DS gap is larger than that, keep a thin local wrapper rather than restyle the DS.
- **Risk:** Server Action redirects lose the toast. **Mitigation:** pass a `?created=1` or `?saved=1` flag, and the list page triggers the toast once in a small client component.
- **Risk:** the E2E test needs a running API. **Mitigation:** it follows the existing `playwright.config.ts` setup. If CI runs no API, the E2E covers only the shell and the unavailable state, and the CRUD path stays manual.

- **Risk:** every open tab polls the Studio, and the Studio polls the API (`/health/ready` may touch the database). **Mitigation:** a 60 s interval, no polling while hidden, and a 3 s timeout. If load ever matters, cache the result in the route for a few seconds.
- **Risk:** `proxy.ts` request logging writes a log line on every poll. **Mitigation:** skip or downgrade logging for `/api/formlens-status` in `proxy.ts` if the logs get noisy (check while implementing).

## Open questions for human review

- None.

## Reference sources

- Design: https://claude.ai/artifact/BVaaT7mhUM2iBjrMn9cfz4, boards `Main.dc.html` (Forms), `Editor.dc.html`, `NewForm.dc.html`.
  - Shell: aside 248 px with logo (36 px primary square and "Form Lens", 18 px bold), nav items 44 px high with icons (list, upload, activity), active item `sidebar-accent` 600 weight. Bottom box: `Status` success "API connected" and the host in `font-code`. Top: `Header variant="full"`, ghost icon toggle, vertical `Separator`, `Breadcrumb`.
  - Main: padding 32/40/56, gap 28. Page header has `text-heading-h1`, a `text-mute` subtitle, and actions on the right.
  - Forms: search (max 380 px) plus "N forms", a card grid `minmax(290px,1fr)` gap 24. Each card has its title, description, `Badge secondary` "N fields", "Last used …", and Use form (default sm) and Edit (outline sm) buttons. The last tile is a dashed `Empty` "New form".
  - Editor: the left column holds the "Basic information" card (name, optional description with a `FieldDescription`) and the "Fields to find" card ("N fields — the order matches the order in the API response", "Add field" outline sm; rows: drag handle, key input in mono 13 px, description input, type, remove icon). The right column (min 320 px) holds the "API response preview" card with a `pre.text-code` on `--muted`. Create mode uses a dashed `Empty` "No fields yet" with "Add first field" and the preview `{ }`.
  - Fonts: Poppins 400–700, JetBrains Mono 400–500.
