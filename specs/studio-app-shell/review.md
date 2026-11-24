# Review: Studio App Shell

**Branch:** feature/studio-app-shell
**Date:** 2026-11-24
**Verdict:** NOT READY

Round 1 (2026-11-19): NOT READY, 9 must-fix items (AC14/AC15, stale 422 banner, hydration, not-found 404 and loading
scope, English text, Unicode search, MSW/mimicry-js, toast cookies, separator); all verified closed in round 2.

Diff: `git diff 5645f09` (merge base with `main`) through `d69689d`, `**/generated/**`, lockfiles and snapshots
excluded; untracked `.claude/launch.json` excluded (local preview config); uncommitted change: status lines in
`tasks.md` only. 117 files, +9584 / −165. Judged against the updated constitution (§7 English Studio text; §1 MSW and
mimicry-js) and the updated spec (AC2: icon-only rail on collapse).

## Spec compliance (spec-verifier)

spec-verifier: `satisfied: true`, AC1–AC25 met, T1–T6 complete, no non-goal violation.

| AC | Status | Evidence |
|----|--------|----------|
| AC1–AC25 | met | spec-verifier: code, unit tests, stories, E2E; QA PASS on 7 flows |
| AC2 | met | icon rail with tooltips (QA); `aria-expanded` gap accepted, see `## Accepted` |
| AC5 | met | e2e `forms.e2e.ts` (theme survives reload) |
| AC14, AC15 | met | QA: messages appear at once on a refused submit, six cases |
| AC22 | met (edge defect) | Unicode fold verified live (python-reviewer, QA with Polish letters); NUL in `search` defect, see below |
| AC23 | met | QA: `last_used_at` = extraction `created_at` |
| AC24 | met | e2e `/forms` at phone width; QA 375 px |

**AC22 and NUL in `search` — judged an acceptable blocker, not an unmet AC.** `search=%00` returns every template and
`search=a%00zzz` returns a template whose name has no NUL (SQLite `LIKE` stops reading the pattern at NUL;
python-reviewer, reproduced live). Reasons:
- AC22's stated scenario (`search=inv` → names containing "inv", case-insensitive, `total` counts only those) passes,
  as do the non-ASCII, `%`/`_` literal and empty-search cases; the spec-verifier, the designated AC judge, reports it
  met. Round 1 overrode the verifier only where live evidence broke the AC's own scenario (AC14/AC15).
- Names cannot contain NUL (`apps/api/src/formlens/templates/models.py:137`), so the correct answer is an empty page;
  the wrong answer returns only rows the unfiltered list already returns: no data exposure, no security impact; the
  Studio search box cannot send a NUL.
- python-reviewer rated it 🟡 (changes requested), so it is not a warning: a non-critical audit finding is an
  acceptable blocker. Fix is small (see Verdict).

- Out of scope (acceptable blockers until accepted): `specs/capabilities.yml`; `E2E_PORT` in
  `apps/studio/playwright.config.ts`; extra "Form saved" / "Form deleted" toasts; `debug` log level for the polled
  path in `apps/studio/proxy.ts:19`. No non-goal violation.
- Drift (warnings): `plan.md` still describes superseded decisions (Polish user text, `?created=1` toast flag, no
  MSW/mimicry-js, route group `forms/(list)`, `aria-expanded` in AC2/T3 text, migration test path
  `tests/migrations/test_migrations.py`); `lib/toast/**`, `tests/unit/msw/**`, `vitest.setup.ts`, the
  template-action-result schema and placeholder/page tests lie outside every task `files` glob; whitespace-only search
  test missing by name (T1 asks for it); a few non-HTTP `vi.mock` stubs remain.

## Tests

- api: passed 1520/1520 (10 deselected, `-m slow`) · coverage 99 % (target ≥ 95 % branch) · ruff, mypy,
  lint-imports pass · Schemathesis 3 seeds pass · `export_openapi --check` exit 0 · oasdiff and Spectral not run (need
  Docker) · pip-audit: deps unchanged.
- @form-lens/api-client: passed 18/18 · coverage 100 % (target 100 %) · `generate:check` OK · type-check OK.
- @form-lens/studio: unit 259/259 · coverage 71.6 % statements / 78.4 % branches (target > 70 %) · Storybook 208/208 ·
  Playwright chromium 29/29 (production build) · type-check OK · Biome OK (2 warnings, 1 info: local CLI/schema
  version) · Knip OK.

## Constitution rules

- DO NOT rename the `Check ✅` or `Audit 🔒` jobs — respected (0 files under `.github/` in the diff).
- DO NOT edit `packages/api-client/src/generated` or `apps/api/openapi.json` by hand — respected (3 generated files
  and `openapi.json` change with the router; `generate:check` OK, `export_openapi --check` exit 0).
- DO NOT put a client-supplied regular expression anywhere but `patterns.py` — respected (0 `re` imports/calls added
  under `apps/api/src`; the Studio builds no `RegExp` from `pattern`).
- DO NOT edit migration `v0001_initial.py` after the first merge — respected (v0001 not in the diff; new v0002).
- DO NOT change the uv version in only one place — respected (no Dockerfile/workflow change).
- DO NOT expect Dependabot to bump the Spectral, oasdiff, pip-audit and `huggingface_hub` pins — respected (no
  `Makefile` / `download_models.sh` change).
- DO NOT use `&&` for conditional rendering in the Studio — respected (0 added `&& (` / `&& <` in changed `.tsx`).
- DO NOT run `template-sync` — respected (not applicable).
- §7 Studio user text in English — respected (spec-verifier; QA: English only on 9 routes).
- §1 Studio test stack (MSW, mimicry-js) — respected for HTTP; a few non-HTTP `vi.mock` stubs remain (warning).
- §6 coverage — met: api 99 % ≥ 95 %, studio unit 71.6 % > 70 %, api-client 100 %.

## Audits

### QA check (agent:testing:qa-engineer) — PASS

7/7 flows pass (shell and icon rail, API status flip within 60 s both ways, create validation six cases, list/search
incl. Polish letters, paging, edit/delete incl. 422 banner clearing, not-found HTTP 404, theme, 375 px, AC23,
English UI on 9 routes). Low observations: separator 32 px = row height in a 64 px header; dev-server-only "script
tag" console warning on not-found; status dot and logo without tooltip in the rail; field row `div role="button"`
wraps inputs; `?page=99` shows "Page 99 of 2". QA left one failed extraction row in the gitignored local
`apps/api/formlens.db`.

### python-reviewer (api) — changes requested, 0🔴 1🟡 3🔵

- 🟡 NUL in `search` breaks the filter (`templates/router.py:76-84` accepts it; `templates/repository.py:133-135`
  passes it to `LIKE`); no test.
- 🔵 final-sigma tests do not tell `casefold()` from `lower()`.
- 🔵 Unicode limits (ß matches "ss", İ vs i, NFC vs NFD) documented only in test comments, not OpenAPI/README.
- 🔵 `mark_used` failure logged at ERROR (optional).

### nextjs:code-reviewer (studio) — APPROVE, 0🔴 0🟡 5🔵

- 🔵 three actions in `features/templates/server/template-actions.ts` instead of `server/actions/*.action.ts`.
- 🔵 `load-template.ts` literal union `"found" | "not-found" | "unavailable"` instead of a const object.
- 🔵 7 components without own stories (field-row, template-pager, template-search, app-header, app-breadcrumbs,
  sidebar-nav, api-status).
- 🔵 vitest config lacks `mockReset` / `restoreMocks`.
- 🔵 Storybook a11y addon `test: "todo"` (`apps/studio/.storybook/preview.tsx:78`).

### react:accessibility-audit (studio, static) — 🟡 0🔴 2🟡 1🔵

| # | Sev | Where | Problem | Fix |
|---|-----|-------|---------|-----|
| 1 | 🟡 | `apps/studio/components/layout/app-sidebar.tsx:17-22` | 2.4.4 / 4.1.2: in the collapsed rail the "Form Lens" text gets `hidden` (display none) and the icon is `aria-hidden`, so the logo link has no accessible name (axe `link-name`, serious) | `aria-label="Form Lens"` on the link, or `sr-only` instead of `hidden` |
| 2 | 🟡 | `apps/studio/features/templates/components/field-row.tsx:79-84` (DS `SortableItem`) | 4.1.2: `div role="button"` wraps the handle, switch, inputs and buttons (axe `nested-interactive`, serious) | DS change (design-system report proposal); Studio cannot fix without forking the component |
| 3 | 🔵 | `apps/studio/.storybook/preview.tsx:78` | axe violations never fail the 208 Storybook tests | `test: "error"` |

No critical violation. Present: nav labels as tooltips and accessible names in the rail, API status label `sr-only`
when collapsed (`api-status-live.tsx:110`), drag handle named (`field-row.tsx:89`), `aria-current` on nav links.
Not checked: live axe run, screen reader, contrast.

## Accepted

- AC2 — the design system's `SidebarTrigger` sets no `aria-expanded` (`apps/studio/components/layout/app-header.tsx:11`).
  Reason: owner's explicit decision to use the plain DS trigger until the DS fixes it; see
  `specs/studio-app-shell/design-system-report.md:11-22`. Accepted 2026-11-24.

## Verdict

NOT READY ❌ — no failing test, no unmet AC, no failed extra check, no critical violation; every blocker below is
acceptable.

Fix or accept:
1. python-reviewer 🟡 / AC22 edge: reject NUL in `search` (422 via `Query(pattern=...)` in `templates/router.py:76`)
   or return an empty page, with an API test for `search=%00` and `search=a%00zzz`; regenerate `openapi.json` and the
   api-client if the contract changes — `/sdd:implement T1`.
2. Accessibility 🟡 #1: accessible name for the logo link in the collapsed rail (`app-sidebar.tsx:17`) —
   `/sdd:implement T3`.
3. Accessibility 🟡 #2: nested-interactive `SortableItem` — accept and add to `design-system-report.md`, or fix in
   the DS.
4. Out of scope: accept or revert `specs/capabilities.yml`, `E2E_PORT` in `playwright.config.ts`, the "Form saved" /
   "Form deleted" toasts, `debug` level in `proxy.ts:19`.

Warnings (no action required for READY): python 🔵 ×3; nextjs 🔵 ×5; QA lows (`?page=99` "Page 99 of 2", rail status
dot without tooltip, dev-only console warning); oasdiff/Spectral not run locally (CI gates them); `plan.md` drift and
files outside task globs; missing whitespace-only search test; remaining non-HTTP `vi.mock` stubs.
