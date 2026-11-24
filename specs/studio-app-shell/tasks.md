# Tasks: Studio App Shell

**Spec:** `specs/studio-app-shell/spec.md`  **Plan:** `specs/studio-app-shell/plan.md`
**Epic:** SAS-d014

## Epic: Studio App Shell

### T1: Template search and last-used date in the API
project: api
status: done
depends_on: []
acceptance: AC22, AC23
plan: High-level approach (API first); Contracts (HTTP, Port, Migration); File-by-file change list › api
scope:
- `GET /v1/templates` accepts optional `search` (max 100 chars): a case-insensitive substring match on `name`, with `%` and `_` taken literally; `total` counts only the matches
- `TemplateResponse` gains `last_used_at` (nullable datetime). It is `null` for a new template, kept by `PUT`, and updated by `mark_used`
- migration `v0002`: nullable `templates.last_used_at`, backfilled with `MAX(extractions.created_at)` per template; downgrade drops it
- `TemplateCatalog.mark_used` port; `ExtractionService.submit` calls it with the clock time after `repository.add` succeeds, never when `add` fails. Marking a deleted template is a no-op
- regenerate `openapi.json` (`make openapi`); the README route table mentions `search`
- tests: API (search matches, case, literal wildcards, `total`, `last_used_at` null/kept), repository (`mark_used`, escaping), extractions service (marks on success only), end to end (submit → template `last_used_at` equals extraction `created_at`), migration upgrade/downgrade
files: packages/api-client/src/generated/**, apps/api/src/formlens/database.py, apps/api/src/formlens/templates/**, apps/api/src/formlens/migrations/versions/v0002_template_last_used.py, apps/api/src/formlens/extractions/domain/ports.py, apps/api/src/formlens/extractions/adapters/template_catalog.py, apps/api/src/formlens/extractions/service_layer/service.py, apps/api/openapi.json, apps/api/tests/templates/**, apps/api/tests/extractions/**, apps/api/tests/test_migrations.py, apps/api/README.md
review fixes (SDD review, NOT READY):
- AC22 for non-ASCII names: register a Unicode casefold SQL function in `Database._on_connect` and use it on both sides of the match (`repository.py`); `search` of "łódź" or "ŁÓDŹ" finds "Łódź Faktura"; `%`, `_` and `\` stay literal; remove the "ASCII only" caveat from the OpenAPI description and docstring (regenerate `openapi.json`, then the api-client with `npm run generate -w @form-lens/api-client`)
- tests: non-ASCII, empty `?search=` and whitespace-only search in `tests/templates/test_api.py` and `test_repository.py`
- `mark_used` is best-effort: when it raises after `repository.add` has committed, `submit` logs it once with `log.exception` and still returns 202; test it with a `FakeTemplateCatalog` that raises
- confirm `make api-check` (oasdiff) exit code and report it
review fixes, round 2 (SDD review, NOT READY; every blocker acceptable, owner chose to fix):
- a NUL character in `search` must not break AC22: SQLite LIKE reads the pattern as a C string, so `search=%00` returned every template and `search=a%00zzz` returned one whose name has no NUL; reject NUL with a 422 Problem Details (`Query(pattern=...)` at `templates/router.py`) or return an empty page; add a test; regenerate `openapi.json` and the api-client
- tests: a final-sigma case that tells `casefold` from `lower()` (name "κοσμοσ" with σ at the end against search "ΚΟΣΜΟΣ" and "κοσμος"); a whitespace-only search test
- document the Unicode limits (ß matches "ss", İ does not match i, composed accent versus combining mark) in one sentence of the `search` description and the README
notes: do not edit `v0001_initial.py` (`api-v0.1.0` is released); templates must not import extractions (import-linter); Problem Details and `operation_id` rules apply; `make check` and `make api-check` (oasdiff: additive only) must pass

### T2: Regenerate the API client
project: @form-lens/api-client
status: done
depends_on: [T1]
acceptance: AC22, AC23
plan: Contracts (Generated client); File-by-file change list › @form-lens/api-client
scope:
- regenerate `src/generated` from the new `openapi.json`; `ListTemplatesParams.search` and `TemplateResponse.last_used_at` appear
- `src/index.test.ts`: `listTemplates({ search: "inv" })` puts `search` in the URL
files: packages/api-client/src/generated/**, packages/api-client/src/index.test.ts
notes: never edit `src/generated` by hand; `generate:check` must pass

### T3: App shell, navigation and live API status
project: @form-lens/studio
status: done
depends_on: []
acceptance: AC1, AC2, AC3, AC4, AC5, AC24, AC25
plan: High-level approach (Studio, shell and status polling); File-by-file change list › @form-lens/studio (globals, layouts, `components/layout/*`, `lib/api-health.ts`, `app/api/formlens-status`, placeholders)
scope:
- DS theme, Poppins and JetBrains Mono, and sidebar tokens in `app/globals.css`; the DS `Toaster` in the root layout; `/` redirects to `/forms`
- route group `app/(shell)/` with the DS `Sidebar` (Forms, New document, Jobs; `aria-current` from the pathname; collapsible with `aria-expanded`), a header with the trigger, breadcrumbs and `ThemeToggle`, and `<main id="main-content">`
- API status: server-rendered first state from `checkApiHealth()` (`/health/ready`, 3 s timeout, never throws); a client component polls `GET /api/formlens-status` every 60 s, pauses while the tab is hidden, checks once on `visibilitychange`, and clears its timer on unmount; the route returns `{ status, host }` with `no-store`
- `/documents/new` and `/jobs` show a "Coming soon" `Empty` inside the shell; a minimal `/forms` page so the redirect lands (T4 fills it)
- phone width: the sidebar collapses to the DS mobile sheet, no horizontal scroll
- quiet request logging for `/api/formlens-status` in `proxy.ts` if every poll logs a line
- tests: `api-health` unit tests (ok, error status, network failure, timeout), route test, stories with play tests for the sidebar (active item, toggle) and status (both states, flips after one interval, no request while hidden)
files: apps/studio/app/globals.css, apps/studio/app/layout.tsx, apps/studio/app/page.tsx, apps/studio/app/(shell)/layout.tsx, apps/studio/app/(shell)/forms/page.tsx, apps/studio/app/(shell)/documents/**, apps/studio/app/(shell)/jobs/**, apps/studio/app/api/formlens-status/**, apps/studio/components/layout/**, apps/studio/lib/api-health*.ts, apps/studio/proxy.ts, apps/studio/tests/unit/proxy.test.ts
review fixes, round 2 (SDD review, NOT READY; owner chose to fix):
- the collapsed icon rail: the logo link needs an accessible name when its text is hidden (e.g. `aria-label="Form Lens"` on the link, WCAG 2.4.4/4.1.2); add tooltips to the logo and the status dot if the design system allows; add a story asserting the link's accessible name when collapsed
notes: the API client is server-only (`lib/formlens-api.ts`); Studio code rules (`function` keyword, ternary not `&&`, no `useMemo`/`useCallback`, `Array<T>`); match the design's shell (plan › Reference sources)

### T4: Forms list with search, paging and last-used date
project: @form-lens/studio
status: done
depends_on: [T2, T3]
acceptance: AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC18, AC20
plan: High-level approach (list in URL params, toast after redirect); File-by-file change list › @form-lens/studio (`app/(shell)/forms/page.tsx`, `loading.tsx`, `load-templates`, `template-card`, `template-list`, `template-search`, `template-pager`)
scope:
- `loadTemplates({ search, page })` maps to `limit`/`offset` and returns items and `total`, or `unavailable`; it never throws
- `/forms`: a page header with "New form", a search that submits `?q=`, the count "N forms", a card grid with the "New form" tile, a pager when `total` exceeds a page, and a skeleton while loading
- card: name, description, "N fields" badge, "Last used <relative date>" or "Never used", Use form (→ `/documents/new`) and Edit (→ `/forms/{id}/edit`)
- states: empty (create the first form), no matches for the search, API unavailable (message, shell still works)
- show the toast once for `?created=1`, `?saved=1` and `?deleted=1` (set by T5's redirects), then drop the flag from the URL
- tests: `load-templates` unit tests (search and page mapping, unavailable), stories for card and list (AC6, AC7, AC10, no-match)
files: apps/studio/app/(shell)/forms/page.tsx, apps/studio/app/(shell)/forms/loading.tsx, apps/studio/features/templates/server/load-templates*.ts, apps/studio/features/templates/components/template-card*, apps/studio/features/templates/components/template-list*, apps/studio/features/templates/components/template-search*, apps/studio/features/templates/components/template-pager*, apps/studio/features/templates/components/action-toast*
notes: depends on T3 because it replaces T3's minimal `/forms` page

### T5: Create, edit and delete a template
project: @form-lens/studio
status: done
depends_on: [T2, T3]
acceptance: AC12, AC13, AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21, AC24
plan: High-level approach (react-hook-form + Zod, Server Actions); Contracts (Studio Zod schema); File-by-file change list › @form-lens/studio (`schemas/`, `utils/template-mapping`, `server/load-template`, `server/template-actions`, `server/map-service-error`, editor components, `forms/new`, `forms/[id]/edit`, `not-found`)
scope:
- add `react-hook-form` and `@hookform/resolvers` to the Studio
- Zod editor schema: name 1–100, description ≤ 300, 1–50 fields, unique keys, `choice` needs 1–50 values (1–100 chars), min/max only for number and integer, pattern only for text
- mapping between form values and API bodies or responses (keeps min/max/pattern) and the JSON preview from the fields
- `/forms/new` and `/forms/[id]/edit`: Basic information card, Fields card (empty state "No fields yet"; add, remove, reorder with the DS `Sortable`; per row key, description, type `Select`, required `Switch`, allowed values for choice, "Advanced" min/max or pattern), live API response preview, Cancel, Create form or Save form
- Server Actions `createTemplate`, `updateTemplate`, `deleteTemplate`: re-validate with the same schema, call the API, `revalidatePath("/forms")`, redirect to `/forms?created=1` / `?saved=1` / `?deleted=1`; API 400/422 map to field and form errors with the input kept; a 404 is reported as not found
- Delete in edit mode with a DS `AlertDialog` confirmation; cancelling changes nothing
- unknown id → `not-found.tsx` with a link back to Forms
- phone width: field rows stack
- tests: schema, mapping, `load-template`, actions and `map-service-error` unit tests; editor stories (create empty, edit filled, add/remove/reorder updates the preview, choice without values, duplicate keys, phone width)
files: apps/studio/package.json, package-lock.json, apps/studio/app/(shell)/forms/new/**, apps/studio/app/(shell)/forms/[id]/**, apps/studio/features/templates/schemas/**, apps/studio/features/templates/utils/**, apps/studio/features/templates/server/load-template.ts, apps/studio/features/templates/server/load-template.test.ts, apps/studio/features/templates/server/template-actions*, apps/studio/features/templates/server/map-service-error*, apps/studio/features/templates/components/template-editor*, apps/studio/features/templates/components/field-row*, apps/studio/features/templates/components/response-preview*, apps/studio/features/templates/components/delete-template-dialog*, apps/studio/features/templates/components/action-toast*, apps/studio/features/templates/components/template-list*, apps/studio/features/templates/components/template-card*, apps/studio/features/templates/server/load-templates*, apps/studio/lib/api-health*.ts, apps/studio/app/api/formlens-status/**, apps/studio/components/layout/**, apps/studio/app/(shell)/forms/**, apps/studio/tests/e2e/**, apps/studio/.storybook/**
review fixes (SDD review, NOT READY) — this task carries all Studio fixes so they land in one pass (the files overlap across T3, T4 and T5):
- AC14, AC15: a refused submit shows its messages at once (duplicate key, choice without allowed values, invalid key format, min above max) and announces them (`aria-live` or focus on the first error); the messages never describe the previous state. Add a story that clicks "Create form" and asserts the message without a further edit
- the API-error banner on the edit page is cleared when a later submit is refused client-side
- fix the hydration mismatch of `SortableItem` (random ids in `data-value` and `aria-describedby`): stable ids (`useId` or the field id) on server and client; give the drag handle an accessible name
- English UI text: the Polish messages of `map-service-error.ts` and the "not found" copy become English; constitution §7 already says so
- toasts through a toast cookie (nextjs-rules toast-cookie pattern) instead of `?created=1|saved=1|deleted=1`; `action-toast` reads and clears the cookie
- `app/(shell)/forms/loading.tsx` applies to the list only: move the list page and its `loading.tsx` into a route group (e.g. `forms/(list)/`) so `/forms/new` and `/forms/[id]/edit` show no list skeleton; "not found" then returns 404 if the framework allows it
- the header vertical `Separator` (`components/layout/app-header.tsx`) spans the height of the toggle and the breadcrumbs, not a short stub
- nextjs-rules in `load-templates.ts`, `lib/api-health.ts`, `app/api/formlens-status/route.ts`: `import "server-only"`, `createLogger({ module })`, `statusCode:` in logs, and the list shows a fixed user-safe message, never the API `title`
- tests: add MSW and `mimicry-js` (`npm install -D msw mimicry-js -w @form-lens/studio`), replace `vi.mock` and `fetch` stubs of HTTP in the Studio tests with MSW handlers and builders (`template-fixtures.ts` becomes builders); add an AC5 test (theme choice survives a reload, e.g. in Playwright `forms.e2e.ts`) and a page-level phone-width check for `/forms`
- optional, if cheap: const enum objects instead of string-literal unions; stories for the new layout components
notes: the user-facing text is English (`map-service-error.ts`), the logs carry the raw error; server actions return typed responses validated with Zod

### T6: End-to-end forms flow
project: @form-lens/studio
status: done
depends_on: [T3, T4, T5]
acceptance: AC1, AC3, AC12, AC18, AC20
plan: File-by-file change list › @form-lens/studio (`tests/e2e/forms.e2e.ts`); Risks (E2E needs a running API)
scope:
- replace `tests/e2e/main-page.e2e.ts` with `tests/e2e/forms.e2e.ts`: the shell and navigation, then create a template, see it in the list, edit it, delete it
- if the E2E setup has no API, cover the shell and the unavailable state, and say that the CRUD path is manual
files: apps/studio/tests/e2e/**, apps/studio/playwright.config.ts
notes: E2E covers happy paths only (constitution, testing philosophy)

Order: T1 ∥ T3 → T2 → T4 ∥ T5 → T6
