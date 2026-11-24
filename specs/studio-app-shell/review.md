# Review: Studio App Shell

**Branch:** feature/studio-app-shell
**Date:** 2026-11-24
**Verdict:** READY

Round 1 (2026-11-19): NOT READY, 9 must-fix items (AC14/AC15, stale 422 banner, hydration, not-found 404 and loading
scope, English text, Unicode search, MSW/mimicry-js, toast cookies, separator); all closed in round 2.
Round 2 (2026-11-24): NOT READY, acceptable blockers only (NUL in `search`, logo link name in the icon rail,
nested-interactive `SortableItem`, out-of-scope files); the first two fixed in PR #30 (T1) and PR #29 (T3).

Diff: `git diff 5645f09` (merge base with `main`) through `93f4485`, `**/generated/**`, lockfiles and snapshots
excluded; untracked `.claude/launch.json` excluded (local preview config); uncommitted: status lines in `tasks.md`
only. 118 files, +9931 / −165. Judged against the updated constitution (§7 English Studio text; §1 MSW and
mimicry-js) and the updated spec (AC2: icon-only rail on collapse).

## Spec compliance (spec-verifier)

spec-verifier: `satisfied: true`, AC1–AC25 met with evidence, T1–T6 complete, no non-goal violation, round-2
blockers closed.

| AC | Status | Evidence |
|----|--------|----------|
| AC1–AC25 | met | spec-verifier: code, unit tests, stories, E2E; QA PASS on 7 flows |
| AC2 | met | icon rail with tooltips, logo link named "Form Lens" (`app-sidebar.tsx:19-21`); `aria-expanded` gap accepted |
| AC14, AC15 | met | QA: validation messages appear at once |
| AC22 | met | Unicode fold live (QA, Polish letters); `search=%00`, `search=a%00zzz` → 422 problem+json (`templates/router.py:81`), repository backstop returns an empty page (`templates/repository.py:136-137`); sigma and whitespace tests added |
| AC23 | met | QA: `last_used_at` = extraction `created_at` |
| AC24 | met | e2e `/forms` at phone width; QA 375 px |
| AC25 | met | stories (hidden-tab pause); QA did not re-check live |

- Out of scope (acceptable blockers until accepted): `specs/capabilities.yml`; `specs/constitution.md` (English text,
  MSW — owner's `/sdd:constitution` update); `E2E_PORT` in `apps/studio/playwright.config.ts`; extra "Form saved" /
  "Form deleted" toasts. No non-goal violation.
- Drift (warnings): `plan.md` still describes superseded decisions (Polish user text, `?created=1` toast flag,
  `aria-expanded` in the AC2 story, no MSW/mimicry-js, no `forms/(list)` route group); `tasks.md` T3 scope says
  "collapsible with aria-expanded"; T1 and plan name `apps/api/tests/test_migrations.py`, the file is
  `apps/api/tests/migrations/test_migrations.py`; `lib/toast/**`, `tests/unit/msw/**`, `vitest.setup.ts`,
  `mock-logger.ts`, `templates-result.ts`, `app/page.test.ts`, `placeholder-pages.test.tsx` lie outside every task
  `files` glob.

## Tests

- api: passed 1571/1571 (10 deselected, `-m slow`) · coverage 99 % (target ≥ 95 % branch) · ruff, mypy,
  lint-imports, `export_openapi --check`, Schemathesis 3 seeds pass · oasdiff, Spectral, pip-audit not run locally
  (Docker; CI gates them).
- @form-lens/api-client: passed 18/18 · coverage 100 % (target 100 %) · `generate:check` OK · type-check OK.
- @form-lens/studio: unit 259/259 · coverage 71.8 % statements / 78.3 % branches (target > 70 %) · Storybook 210/210 ·
  type-check OK · Biome OK (2 warnings, 1 info) · Knip OK · Playwright 29/29 in round 2, e2e files unchanged since.

## Constitution rules

- DO NOT rename the `Check ✅` or `Audit 🔒` jobs — respected (0 files under `.github/` in the diff).
- DO NOT edit `packages/api-client/src/generated` or `apps/api/openapi.json` by hand — respected (`openapi.json` and
  `listTemplatesParams.ts` change with the router's `pattern`/description; `generate:check` OK,
  `export_openapi --check` OK).
- DO NOT put a client-supplied regular expression anywhere but `patterns.py` — respected (0 `re` imports/calls added
  under `apps/api/src`; the `Query(pattern=...)` is a fixed server-side literal).
- DO NOT edit migration `v0001_initial.py` after the first merge — respected (not in the diff).
- DO NOT change the uv version in only one place — respected (no Dockerfile/workflow change).
- DO NOT expect Dependabot to bump the Spectral, oasdiff, pip-audit and `huggingface_hub` pins — respected (no
  `Makefile` / `download_models.sh` change).
- DO NOT use `&&` for conditional rendering in the Studio — respected (0 added `&& (` / `&& <` in changed `.tsx`).
- DO NOT run `template-sync` — respected (not applicable).
- §7 Studio user text in English — respected (spec-verifier; QA English-only UI).
- §1 Studio test stack (MSW, mimicry-js) — respected for HTTP.
- §6 coverage — met: api 99 % ≥ 95 %, studio unit 71.8 % > 70 %, api-client 100 %.

## Audits

### QA check (agent:testing:qa-engineer) — PASS

7/7 flows pass (shell and icon rail with tooltips and the logo link's name; API status flips within 60 s both ways;
create validation; list/search incl. Polish letters, paging, no skeleton on "New form"; `search=%00` and
`search=a%00zzz` → 422 problem+json; edit/delete incl. 422 banner clearing, not-found 404; theme, 375 px; AC23;
English UI). Observations: type dropdown ordered alphabetically by key; dev-only console warning on not-found; AC25
hidden-tab pause not re-checked live. Up to two extraction rows may remain in the gitignored local DB.

### python-reviewer (api) — APPROVE, 0🔴 0🟡 0🔵

All three round-2 findings fixed (NUL 422 plus repository backstop; sigma tests tell `casefold()` from `lower()`;
Unicode limits in OpenAPI and README), proven by mutants and live runs.

### nextjs:code-reviewer (studio) — APPROVE, 0🔴 0🟡 5🔵

- 🔵 three actions in `features/templates/server/template-actions.ts` instead of `server/actions/*.action.ts`.
- 🔵 `load-template.ts` literal union instead of a const object.
- 🔵 8 components without own stories (incl. `rail-tooltip.tsx`, covered by parent stories).
- 🔵 vitest config lacks `mockReset` / `restoreMocks`.
- 🔵 Storybook a11y addon `test: "todo"` (`apps/studio/.storybook/preview.tsx:78`).

Round-2 logo-link finding verified fixed live.

### react:accessibility-audit (studio, static) — 🟡 0🔴 1🟡 3🔵

| # | Sev | Where | Problem | Fix |
|---|-----|-------|---------|-----|
| 1 | 🟡 | `apps/studio/features/templates/components/field-row.tsx` (DS `SortableItem`) | 4.1.2: `div role="button"` wraps inputs and buttons (axe `nested-interactive`, serious, not critical); inner controls stay native and Tab-reachable | DS change, `design-system-report.md` §5 — accepted, see `## Accepted` |
| 2 | 🔵 | `apps/studio/components/layout/rail-tooltip.tsx:18-22` | Radix trigger adds `aria-describedby` to the tooltip while open; on the logo link and nav buttons the description repeats the name (double announcement, no SC failure); DS `SidebarMenuButton` does the same | DS change — accepted, see `## Accepted` |
| 3 | 🔵 | `apps/studio/components/layout/api-status-live.tsx:111-116` | rail tooltip on the status dot opens on hover only (the `Status` div is not focusable); keyboard users see only the coloured dot when collapsed (label is `sr-only`, so AT gets it) | optional: expand the sidebar for text, or make the status focusable |
| 4 | 🔵 | `apps/studio/.storybook/preview.tsx:78` | axe violations never fail the 210 Storybook tests | `test: "error"` |

Fixed since round 2: logo link named in the rail (`app-sidebar.tsx:20`, `aria-label` equals visible text, 2.5.3 OK).
No critical violation. Not checked: live axe run, screen reader, contrast.

## Accepted

- AC2 — the design system's `SidebarTrigger` sets no `aria-expanded` (`apps/studio/components/layout/app-header.tsx:11`).
  Reason: owner's explicit decision to use the plain DS trigger until the DS fixes it; see
  `specs/studio-app-shell/design-system-report.md:11-22`. Accepted 2026-11-24.
- Accessibility — DS `SortableItem` root is `div role="button"` wrapping the field row's controls (axe
  `nested-interactive`, `features/templates/components/field-row.tsx`). Reason: design-system issue, owner maintains
  the DS; reported in `specs/studio-app-shell/design-system-report.md` §5; serious, not critical (controls are native
  and keyboard-reachable). Accepted 2026-11-24.
- Accessibility — tooltip `aria-describedby` repeats the accessible name in the collapsed rail
  (`components/layout/rail-tooltip.tsx`, same as DS `SidebarMenuButton`). Reason: design-system behaviour, owner
  maintains the DS; no WCAG failure. Accepted 2026-11-24 (written into `design-system-report.md` §6).

- Out of scope — `specs/capabilities.yml` (SDD config: Studio runner `skill:nextjs:run-nextjs-task`, `qa-engineer` in
  `review.checks`). Reason: the owner's own configuration decision. Accepted 2026-11-24.
- Out of scope — `specs/constitution.md` (§7 Studio text English; §1 MSW and mimicry-js). Reason: the owner's own
  decision, the old wording was wrong. Accepted 2026-11-24.
- Out of scope — `E2E_PORT` in `apps/studio/playwright.config.ts`. Reason: lets the E2E run beside the owner's dev
  server on port 3000; T6 lists this file. Accepted 2026-11-24.
- Out of scope — the extra "Form saved" and "Form deleted" toasts (spec names only "Form created", AC12). Reason: the
  plan and T4/T5 specify them; consistent feedback. Accepted 2026-11-24.

## Verdict

READY ✅ — no failing test, no unmet AC, no non-goal violation, no failed extra check, no critical violation. The
four out-of-scope items were accepted by the owner (see `## Accepted`).

Warnings (no action required): nextjs 🔵 ×5; a11y 🔵 #3–#4; QA observations (alphabetical type order, dev-only
console warning, AC25 not re-checked live); oasdiff/Spectral/pip-audit not run locally (CI gates them); doc drift
(`plan.md`, `tasks.md` T3 text, migration test path, files outside task globs).
