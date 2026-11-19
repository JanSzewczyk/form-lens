# Review: Studio App Shell

**Branch:** feature/studio-app-shell
**Date:** 2026-11-19
**Verdict:** NOT READY

Diff: `git diff 5645f09` (merge base with `main`), `**/generated/**`, lockfiles and snapshots excluded; untracked
`.claude/launch.json` excluded (local preview config). 99 files. Judged against the constitution as updated on
2026-11-19 (Studio user text in English; MSW and mimicry-js in the Studio test stack).

## Spec compliance (spec-verifier)

spec-verifier: `satisfied: true`, AC1–AC25 met. The QA check (live app) contradicts AC14 and AC15; this review
takes the QA result.

| AC | Status | Evidence |
|----|--------|----------|
| AC1–AC4, AC6–AC13, AC16–AC23, AC25 | met | spec-verifier: code, unit tests, stories, E2E; QA confirmed AC6–AC9, AC12, AC13, AC16–AC18, AC20–AC22 (AC22 ASCII only, see Audits) |
| AC5 | met, untested | code and stories only; QA confirmed theme survives reload; no test at any layer |
| AC14 | **not met** | QA F1: a refused submit with a duplicate key shows no message; the message appears only after the next edit and can describe the previous state |
| AC15 | **not met** | QA F1: same behaviour for a choice field without allowed values |
| AC22 | met for ASCII only | python-reviewer: `lower()` in SQLite folds ASCII only (`templates/repository.py:128-133`); "Łódź Faktura" not found by `search=łódź`; owner decided to fix Unicode folding |
| AC24 | met, untested at page level | stories; QA confirmed 375 px; no page-level phone-width test |

- Out of scope / non-goal violations (minor, no non-goal violation): `specs/capabilities.yml`, `E2E_PORT` in
  `apps/studio/playwright.config.ts`, `@source` in `apps/studio/app/globals.css`, head-revision change in
  `apps/api/tests/extractions/test_lifespan.py`, extra "Form saved" / "Form deleted" toasts.
- Drift: test files outside task `files` globs (`apps/api/tests/migrations/test_migrations.py` vs planned
  `tests/test_migrations.py`, `app/(shell)/forms/page.test.tsx`, `app/(shell)/placeholder-pages.test.tsx`,
  `app/page.test.ts`); `specs/capabilities.yml` not in any task.

## Tests

- api: passed 1475/1475 (10 deselected, `-m slow`) · coverage 99 % (target ≥ 95 % branch) · ruff, mypy,
  lint-imports, Schemathesis pass; `openapi-check` / oasdiff exit code not confirmed.
- @form-lens/api-client: passed 18/18 · coverage 100 % (target 100 %) · type-check and `generate:check` OK.
- @form-lens/studio: `test:unit:coverage` passed · unit coverage **52.7 % statements (target > 70 %)** ·
  Storybook 191/191 · Playwright chromium 17/17 · type-check OK · `next build` OK · Biome OK (2 warnings, 1 info) ·
  Knip OK.

## Constitution rules

- DO NOT rename the `Check ✅` or `Audit 🔒` jobs — respected (no `.github/` change in the diff).
- DO NOT edit `packages/api-client/src/generated` or `apps/api/openapi.json` by hand — respected (`generate:check`
  passes; `openapi.json` changes alongside the router/schemas; `openapi-check` exit not confirmed).
- DO NOT put a client-supplied regular expression anywhere but `patterns.py` — respected (no `re` use added under
  `apps/api/src`; the Studio only length-checks and forwards `pattern` — `template-form-schema.ts:50`,
  `template-mapping.ts:36` — and builds no `RegExp`).
- DO NOT edit migration `v0001_initial.py` after the first merge — respected (new `v0002_template_last_used.py`;
  v0001 untouched).
- DO NOT change the uv version in only one place — respected (no Dockerfile/workflow change).
- DO NOT expect Dependabot to bump the Spectral, oasdiff, pip-audit and `huggingface_hub` pins — respected (no
  pin change).
- DO NOT use `&&` for conditional rendering in the Studio — respected (0 `&& (` / `&& <` in changed `.tsx`).
- DO NOT run `template-sync` — respected (not applicable).
- §7 error handling (updated): **violated** — Polish user-facing text in
  `apps/studio/features/templates/server/map-service-error.ts:25-33` (7 messages); the rule is English.
- §1 Studio test stack (updated): HTTP mocked with `vi.mock` / `fetch` stubs instead of MSW, no mimicry-js builders
  (`features/templates/server/*.test.ts`, `lib/api-health.test.ts`, `app/api/formlens-status/route.test.ts`;
  `features/templates/utils/template-fixtures.ts` is a hand-written fixture module).
- §6 coverage: Studio unit 52.7 % < 70 %.

## Audits

### QA check (agent:testing:qa-engineer) — FAIL

- F1 (High): AC14, AC15 not met; also invalid key format and min > max — a refused submit shows no message.
- F2 (Medium): stale API 422 banner stays after a later client-side refusal on the edit page.
- F3 (Medium): hydration mismatch on every edit page with fields — random ids in `data-value` /
  `aria-describedby` of `SortableItem` (`features/templates/components/field-row.tsx:81`, via
  `template-editor.tsx:198`).
- F4 (Low): API-derived messages in Polish (`map-service-error.ts:25-33`).
- F5 (Low): "Form not found" returns HTTP 200 — `app/(shell)/forms/loading.tsx` streams before `notFound()`.
- Not checked: AC3 unavailable state, AC10, AC11, AC23 UI, AC25 transition, limits, drag-and-drop.

### python-reviewer (api) — changes requested, 0🔴 1🟡 2🔵

- 🟡 AC22 case-insensitive for ASCII only (`templates/repository.py:128-133`); owner: fix Unicode folding.
- 🔵 `mark_used` runs in a second transaction after `repository.add` commits; a failure returns 500 although the
  extraction is stored (`extractions/service_layer/service.py`); contract undecided.
- 🔵 no non-ASCII / empty / whitespace search tests (`tests/templates/test_api.py`, `test_repository.py`).

### nextjs:code-reviewer (studio) — changes requested, 0🔴 2🟡 5🔵

- 🟡 nextjs-rules in `features/templates/server/load-templates.ts`: no `import "server-only"`, default logger
  (`:3`) instead of `createLogger({ module })`, `status:` instead of `statusCode:` (`:37`), API-supplied `title`
  rendered as `reason` (`:38`, shown in `components/template-list.tsx:35`) instead of a fixed message. Same logger
  pattern in `lib/api-health.ts:6` and `app/api/formlens-status/route.ts:4` (route also lacks `server-only`).
- 🟡 AC5 has no test at any layer.
- 🔵 string-literal unions instead of const enum objects (`load-templates.ts:18-19`, `lib/api-health-types.ts`).
- 🔵 eight components without stories.
- 🔵 three actions in `features/templates/server/template-actions.ts` instead of `server/actions/*.action.ts`.
- 🔵 HTTP mocked via `vi.mock` / `fetch` instead of MSW (owner: adopt MSW and mimicry-js).
- 🔵 `app/(shell)/forms/loading.tsx` also wraps `/forms/new` and `/forms/[id]/edit`: list skeleton on "New form",
  and the HTTP 200 for not-found (F5).
- 🔵 toast via `?created=1` / `?saved=1` / `?deleted=1` URL flags (`template-actions.ts:81,116`,
  `components/action-toast.tsx`) instead of toast cookies (owner: use toast cookies per nextjs-rules).

### react:accessibility-audit (studio, static) — 🟡 0🔴 2🟡 1🔵

| # | Sev | Where | Problem | Fix |
|---|-----|-------|---------|-----|
| 1 | 🟡 | `features/templates/components/template-editor.tsx` submit path (F1) | 3.3.1 Error Identification: a refused submit announces no error (same root cause as AC14/AC15) | show and announce field errors on submit |
| 2 | 🟡 | `features/templates/components/field-row.tsx:87-89` | 4.1.2 drag handle has no accessible name (icon is `aria-hidden`); up/down buttons give a keyboard alternative | `aria-label={\`Reorder field ${number}\`}` on `SortableItemHandle` |
| 3 | 🔵 | `apps/studio/.storybook/preview.tsx:78` | a11y addon in `test: "todo"`: axe violations never fail the 191 Storybook tests | switch to `"error"` |

No critical violation. Labels on all field inputs, `role="search"`, `nav aria-label="Pages"`, `role="status"` on API
status, `aria-expanded` on the sidebar toggle: present. Not checked: live axe run, screen reader, contrast.

### Owner's visual findings

- Vertical `Separator` between the sidebar toggle and breadcrumbs is ~20 px (`data-[orientation=vertical]:h-5`,
  `components/layout/app-header.tsx:13`).
- List skeleton appears on clicking "New form" (`app/(shell)/forms/loading.tsx` scope).

## Accepted

<!-- none yet -->

## Verdict

NOT READY ❌

Must fix (not acceptable):
1. AC14/AC15 (QA F1): show field errors on a refused submit for duplicate key, choice without allowed values, key
   format and min > max; announce them — `/sdd:implement T5`.
2. QA F2: clear the API 422 banner on a later client-side refusal on the edit page — `/sdd:implement T5`.
3. QA F3: stable ids for `SortableItem` (`field-row.tsx:81`, `template-editor.tsx:198`) to remove the hydration
   mismatch — `/sdd:implement T5`.
4. QA F5 + owner: move `app/(shell)/forms/loading.tsx` so it covers the list only (e.g. a route group for the list);
   not-found returns 404, no list skeleton on `/forms/new` — `/sdd:implement T4`.
5. Owner / §7: translate the 7 messages in `map-service-error.ts:25-33` to English and update its tests —
   `/sdd:implement T5`.
6. Owner / AC22: Unicode case folding for `search` (`templates/repository.py:128-133`) with non-ASCII, empty and
   whitespace tests — `/sdd:implement T1`.
7. Owner / §1: replace `vi.mock` / `fetch` HTTP stubs with MSW handlers and mimicry-js builders in the Studio tests —
   `/sdd:implement T3`, `T4`, `T5` (their test files).
8. Owner: toast cookies instead of `?created=1` / `?saved=1` / `?deleted=1` (`template-actions.ts:81,116`,
   `action-toast.tsx`) — `/sdd:implement T5`.
9. Owner: full-height header separator (`app-header.tsx:13`) — `/sdd:implement T3`.

Fix or accept:
10. nextjs-rules in `load-templates.ts`, `lib/api-health.ts`, `formlens-status/route.ts`: `server-only`,
    `createLogger({ module })`, `statusCode`, fixed message instead of API `title`.
11. Add an AC5 test (theme persists across reload) and a page-level phone-width check (AC24).
12. Raise Studio unit coverage from 52.7 % to > 70 %.
13. Name the drag handle (`field-row.tsx:87`).
14. spec-verifier out-of-scope items (`specs/capabilities.yml`, `E2E_PORT`, `@source`, `test_lifespan.py`, extra
    toasts).
