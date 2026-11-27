# Review: New Document Upload Flow

**Branch:** feature/new-document-upload-flow
**Date:** 2026-11-27
**Verdict:** NOT READY

Round 2 at HEAD `5d7abc5`. Diff: `git diff 8e97df84` (generated globs, lock files and snapshots excluded) — 85 files,
+7266 / −65. Untracked: `apps/studio/coverage-unit/**` (coverage artifacts) and `apps/studio/AGENTS.md` (written by
`next dev`/`next build`); neither is a feature file.

## Round 1 (NOT READY at `19d6e91`) — fixed since

PR #43 (T3 fix round), `apps/api` unchanged:
- Critical #1 fixed: `?template=` is checked as a UUID in `apps/studio/app/(shell)/documents/new/page.tsx`; QA sent
  `..%2Fextractions`, `../extractions`, double-encoded, `uuid%2F..%2F..`, `not-a-uuid` → 200 "Form not found", no API call.
- Critical #2 fixed: the runtime limit is capped at the build-time body limit (`capUploadLimitMb`, `data/env/server.ts`,
  `FORMLENS_BUILD_MAX_UPLOAD_MB` in `next.config.ts`); "restart" comments replaced in `next.config.ts`, `data/env/server.ts`,
  `.env.example`. QA: build 25 + runtime 50 → hint "max 25 MB", 30 MB / 25.5 MB refused with the AC12 message, no 500.
- AC35 covered: `upload-step-layout.tsx` plus phone-width stories (`upload-step-layout.stories.tsx`,
  `fields-to-find-card.stories.tsx`).
- Still open from round 1: api major (202 description, README), studio majors #3–#5 (coverage-unit ignores, fetch mock,
  wall-clock story). AC35 still missing from plan.md.

## Spec compliance (spec-verifier)

`satisfied: true` — 39/39 AC met.

| AC | Status | Evidence |
|----|--------|----------|
| AC1–AC34 | met | unit, Storybook and API tests (spec-verifier) |
| AC35 | met | `upload-step-layout.stories.tsx:51,57,67,75`; `fields-to-find-card.stories.tsx:53,61,69`; `new-document-stepper.stories.tsx:39`; `choose-form-list.stories.tsx:152,175`; `upload-form.stories.tsx:223`; `extraction-status-view.stories.tsx:465` |
| AC36–AC39 | met | API and Studio tests (spec-verifier) |

- Non-goal violations: none.
- Out of scope: untracked `apps/studio/coverage-unit/**` (coverage artifacts, not in the feature diff; `apps/studio/.gitignore` ignores only `coverage`).
- Drift (non-blocking):
  - AC35 has no counterpart in plan.md.
  - `plan.md:73,106` and `tasks.md:80` say the upload limit "needs a restart"; it is now build-time (runtime can only lower it). The plan does not name `FORMLENS_BUILD_MAX_UPLOAD_MB` or `capUploadLimitMb`.
  - `plan.md:102` and `tasks.md:160` name `new-document.spec.ts`; the file is `tests/e2e/new-document.e2e.ts`.
  - T2 (api-client) lists a studio path.
  - Several code files missing from plan's file list (all covered by task globs).

## Tests

- api: 1699 passed / 0 failed (10 deselected: `slow`) · coverage 99% (target ≥ 95% branch) — pass
- @form-lens/studio: 419 passed / 0 failed in 38 files · statements 78.81%, branches 77.74%, functions 69.05%, lines 79.24% (target unit > 70%) — pass
- @form-lens/api-client: 20 passed / 0 failed — pass (only generated code changed)

## Constitution rules

- DO NOT rename `Check ✅` / `Audit 🔒` — respected (no workflow file in the diff)
- DO NOT edit `src/generated` or `openapi.json` by hand — respected (`export_openapi --check` passes; client regenerated)
- DO NOT put a client-supplied regex outside `patterns.py` — respected (no `re` use added in `apps/api/src`)
- DO NOT edit `v0001_initial.py` after the first merge — respected (new revision `v0003_extraction_cancel_filename.py`)
- DO NOT change the uv version in one place — respected (no Dockerfile or workflow change in `apps/api`)
- DO NOT expect Dependabot to bump the Makefile/downloader pins — respected (not touched)
- DO NOT use `&&` for conditional rendering — respected (every `&&` in added `.tsx` lines is a boolean expression, none renders JSX)
- DO NOT run `template-sync` — respected

## Audits

- python-reviewer (api): FAIL — 0 critical, 2 major, 2 minor (code unchanged since round 1). ruff format/check, mypy, lint-imports, `export_openapi --check` pass; Schemathesis 3 seeds pass; race guard proven by mutant.
  - Major 1: `apps/api/src/formlens/extractions/router.py:35` (`openapi.json:1268`) — 202 description "until status is completed or failed" omits `cancelled`.
  - Major 2: `apps/api/README.md:59,345-347,385-392,398` — no cancel route row; GET row lacks `filename`/`template_name`/`fields`; flow sentence and status table lack `cancelled`; cancel's 404/409 not listed; feature bullet lacks cancel/filename.
  - Minor: `schemas.py:51` `fields` has no `examples`; `model.py:172-181` `upload_filename` keeps NUL/control characters (consistency gap, not a vulnerability).
- nextjs:code-reviewer (studio): FAIL — 0 critical, 5 major, 9 minor, 4 tidy. Both round-1 criticals fixed on every user-reachable path (reproduced on the standalone build). type-check and `next build` pass; biome/knip pass on the source, fail only on untracked `coverage-unit/`; touched stories 59/59 pass.
  - Major 1: `apps/studio/features/templates/server/load-template.ts:20-22` (caller `app/(shell)/forms/[id]/edit/page.tsx:13,26`; both outside this diff, from PR #31). An unchecked id reaches the client path: `GET /forms/..%2Fextractions/edit` makes the Studio call `GET /v1/templates/../extractions` (404) and `GET /v1/extractions` (200, from `generateMetadata`); the page answers 404. Judged **major, not critical**: read-only GET, nothing from the response is rendered, writes are guarded by `isTemplateId` in template-actions, and the code predates this feature. This feature's own caller is fixed; moving the guard into `loadTemplate` closes the remaining path.
  - Major 2: `apps/studio/Dockerfile:12-14` (outside the diff) vs `.env.example:10-11`, `data/env/server.ts:23-25,61`, `next.config.ts:5-8` — the docs say raising the limit needs a rebuild with the value set at build time, but the Dockerfile has no `ARG FORMLENS_MAX_UPLOAD_MB` and its comment says env is read at container start. The image is always capped at 25 MB, silently (no log).
  - Major 3: `coverage-unit/` not ignored in `apps/studio/.gitignore`, `biome.json`, `knip.json` (pre-existing); the lint gate fails after the constitution's coverage command.
  - Major 4: `extraction-status-view.stories.tsx:56-66` fakes `globalThis.fetch` with `fn()` instead of MSW.
  - Major 5: `extraction-status-view.stories.tsx:566-575` (ReopenedWhileRunning) asserts a 5500–7500 ms wall-clock window on the real 3 s timer; the only proof of the 3000 ms default. Flakiness not reproduced.
  - Minor / tidy: listed under Warnings.
- qa-engineer (extra check): PASS — all 39 AC and edge cases pass on dev and the standalone build; T3 fixes confirmed; AC35 at 375 px: scrollWidth = clientWidth on all pages, panels stack.
- Skill audits (`auto`): none run beyond the agents above; python-reviewer and nextjs:code-reviewer already apply the stack rule skills, and the Storybook a11y addon covers accessibility in the story tests. No critical security or accessibility finding.

## Accepted

<!-- none yet -->

## Verdict

NOT READY ❌ — no unacceptable blocker; every blocker below may be accepted by the user.
- `/sdd:implement T1` (acceptable): fix the 202 description at `router.py:35` ("until completed, failed or cancelled") and `apps/api/README.md:59,345-347,385-392,398` (cancel route, its 404/409, `cancelled` status, GET fields). Then `make openapi` and `npm run generate -w @form-lens/api-client`.
- `/sdd:implement T3` (acceptable): move the UUID check into `loadTemplate` (`features/templates/server/load-template.ts:20`) so `/forms/[id]/edit` cannot send a path-traversing id; add a test for `..%2Fextractions`.
- `/sdd:implement T3` (acceptable): add `ARG FORMLENS_MAX_UPLOAD_MB` + `ENV` to the build stage of `apps/studio/Dockerfile`, fix its comment at line 12, and log a warning when the runtime value is capped.
- Fix (acceptable): add `coverage-unit` to `apps/studio/.gitignore`, `biome.json` and `knip.json` (also clears the out-of-scope untracked artifacts).
- `/sdd:implement T4` (acceptable): mock HTTP in `extraction-status-view.stories.tsx` with MSW, or record an exception.
- `/sdd:implement T4` (acceptable): prove the 3000 ms interval with fake timers in a unit test and drop the elapsed-time bounds from ReopenedWhileRunning.

### Warnings

- Crafted server-action body over the build-time limit (> 26 MB) → HTTP 500 "Request body exceeded 26MB … Unexpected end of form" instead of 413 (`next.config.ts:30`). Not reachable from the UI (the client and server checks refuse the file first), no data exposed, likely pre-existing Next.js behaviour. Not a blocker; `spec.md:93` ("the API's refusal (AC15) still covers it") does not hold for such bodies — reword it.
- Drift: add AC35 to plan.md; replace "needs a restart" in `plan.md:73,106`, `tasks.md:80` with the build-time rule; fix the E2E file name in `plan.md:102`, `tasks.md:160`; fix the T2 path list.
- Studio minors: `load-template.ts:25` returns data without a schema parse; `CancelResult` (`schemas/extraction.ts:88-95`) not a Zod schema; default `cancelMock` never resolves; E2E uses `localhost` not `127.0.0.1` and `next start` with `output: standalone`; string-literal unions instead of as-const objects; `extraction-poller.ts` in `hooks/` but not a hook; `//` comment at `upload-form.tsx:58`; inline FIELDS in stories instead of builders.
- Studio tidy: default 25 declared 3 times; `capUploadLimitMb` tests in `accepted-file.test.ts` instead of `data/env/server.test.ts`; `PHONE_VIEWPORTS`/spill check duplicated in two story files; `documents/new/page.tsx:55-57` returns unused `maxMb`.
- api minors: `schemas.py:51` no `examples`; `model.py:172-181` `upload_filename` keeps NUL/control characters.
- QA environment notes: dev reload loop after `next build` in the same `.next` (not attributed to the feature); dev-only "Encountered a script tag" on `/jobs/<unknown>` (`jobs/[id]/not-found.tsx`); `next dev` writes untracked `apps/studio/AGENTS.md` — proposal: ignore it.
