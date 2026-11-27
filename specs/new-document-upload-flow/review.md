# Review: New Document Upload Flow

**Branch:** feature/new-document-upload-flow
**Date:** 2026-11-27
**Verdict:** NOT READY

Diff: `git diff 8e97df84` (generated globs, lock files and snapshots excluded) — 82 files, +6762 / −65.

## Spec compliance (spec-verifier)

`satisfied: false` — 38/39 AC met with tests, 1 unmet.

| AC | Status | Evidence |
|----|--------|----------|
| AC1–AC34 | met | unit, Storybook and API tests (spec-verifier) |
| AC35 | unmet (no automated test) | Upload step two-column layout (`apps/studio/app/(shell)/documents/new/page.tsx:88-96`, SelectedFormItem + UploadForm next to FieldsToFindCard) has no phone-width story or test; FieldsToFindCard has no phone-width story. Status page part covered at `extraction-status-view.stories.tsx:465`. QA checked it by hand at 375 px (scrollWidth = clientWidth = 375 on every page), but constitution §6 requires Storybook component tests for UI and the spec says "Each AC maps to one test" |
| AC36–AC39 | met | API and Studio tests (spec-verifier) |

- Non-goal violations: none.
- Out of scope: untracked `apps/studio/coverage-unit/.tmp/*.json` (coverage artifacts). `apps/studio/.gitignore:26` ignores only `coverage`. Not part of the feature diff.
- Drift:
  - AC35 has no counterpart in plan.md.
  - `plan.md:102` and `tasks.md:160` name `tests/e2e/new-document.spec.ts`; the file is `tests/e2e/new-document.e2e.ts`.
  - T2 (api-client) lists `apps/studio/.../extraction.builder.ts`, outside its project path.
  - Files in the code but missing from plan's file list: `dependencies.py`, `fakes.py`, `test_processor.py`, `test_health.py`, `extraction-poller.ts`, `extraction-status-view-not-found.tsx`, `jobs/[id]/not-found.tsx`, page tests, `app-breadcrumbs.test.tsx`.
  - The E2E test skips when no API is running, and CI runs no E2E. The same ACs are also covered by stories and unit tests.

## Tests

- api: 1699 passed / 0 failed (10 deselected: `slow`) · coverage 99% (target ≥ 95% branch) — pass
- @form-lens/studio: 373 passed / 0 failed in 38 files · statements 78.72%, branches 77.34%, functions 68.91%, lines 79.15% (target unit > 70%) — pass
- @form-lens/api-client: 20 passed / 0 failed — pass (only generated code changed)

## Constitution rules

- DO NOT rename `Check ✅` / `Audit 🔒` — respected (no workflow file in the diff)
- DO NOT edit `src/generated` or `openapi.json` by hand — respected (`export_openapi --check` and the regenerated client match, per python-reviewer and spec-verifier)
- DO NOT put a client-supplied regex outside `patterns.py` — respected (no `re` use added in `apps/api/src`)
- DO NOT edit `v0001_initial.py` after the first merge — respected (new revision `v0003_extraction_cancel_filename.py`; v0001 untouched)
- DO NOT change the uv version in one place — respected (no Dockerfile or workflow change)
- DO NOT expect Dependabot to bump the Makefile/downloader pins — respected (not touched)
- DO NOT use `&&` for conditional rendering — respected (0 `&&` in JSX in the added `.tsx` lines; the 6 `&&` hits are boolean expressions)
- DO NOT run `template-sync` — respected

## Audits

- python-reviewer (api): FAIL — 0 critical, 1 major, 1 minor. ruff, mypy, lint-imports, openapi check and Spectral pass. Schemathesis passed with 3 seeds. Removing the race guard in `cancel_if_unfinished` breaks the tests (2 mutants).
  - Major: `apps/api/src/formlens/extractions/router.py:35` (`openapi.json:1268`) tells clients to poll "until status is completed or failed", but `cancelled` is now final too. `apps/api/README.md:345-347` and `:385-392` lack the cancel route, the `cancelled` status, and repeat the same text.
  - Minor: `schemas.py:51` `fields` has no `examples`.
- nextjs:code-reviewer (studio): FAIL — 2 critical, 3 major, 8 minor. type-check and `next build` pass. biome and knip pass on the source; they fail only because of the untracked `coverage-unit/`.
  - Critical (security) #1: `apps/studio/app/(shell)/documents/new/page.tsx:34,50`. The raw `?template=` value goes into `loadTemplate` without validation, and the generated client puts it into the URL path. `?template=..%2Fextractions` calls `GET /v1/extractions` and the page returns HTTP 500. Reproduced; the source confirms there is no UUID check.
  - Critical #2: `next.config.ts:5-32`, `.env.example:10-11` and `data/env/server.ts:22-25`. The body limits (`serverActions.bodySizeLimit`, `proxyClientMaxBodySize`) are fixed when the standalone build is made. The UI and `checkFile` read `FORMLENS_MAX_UPLOAD_MB` at runtime, and the comments say a restart picks up a change. Reproduced: built with 26 MB, run with 50, a 30 MB upload gets HTTP 500 instead of the AC12/AC15 message. The spec edge case ("the API's refusal (AC15) still covers it") does not hold.
  - Major #3: `coverage-unit/` is missing from `.gitignore`, `biome.json` and `knip.json`, so the lint gate fails after the constitution's coverage command runs. This predates the branch.
  - Major #4: `extraction-status-view.stories.tsx:35,56-66` replaces `globalThis.fetch` with `fn()`. Constitution §1 and the studio rules say to mock HTTP with MSW.
  - Major #5: `extraction-status-view.stories.tsx:563-576` (ReopenedWhileRunning) checks a wall-clock window of 5500–7500 ms on the real 3 s timer, and it is the only check of the 3000 ms default. It is likely to be flaky; flakiness was not reproduced.
  - Minor: 8 findings, listed under Warnings.
- qa-engineer (extra check): PASS. All 39 AC and FR1/5/7/8 checked in Playwright against the running API and Studio. AC35 checked at 375 px. The existing E2E test passed in 13.7 s.
- Skill audits (`auto`): none run beyond the agents above. The python-reviewer and nextjs:code-reviewer audits already apply the stack rule skills (fastapi-rules, nextjs-rules, react-rules, storybook-rules). The Storybook a11y addon covers accessibility in the story tests.

## Accepted

<!-- none yet -->

## Verdict

NOT READY ❌
- `/sdd:implement T3`: validate `?template` with `z.uuid().safeParse` in `parseSearchParams` (`apps/studio/app/(shell)/documents/new/page.tsx:34`). A non-UUID shows "Form not found", the same as `load-extraction.ts:20-22`. Add a test for `..%2Fextractions`.
- `/sdd:implement T3`: make the Studio upload limit match the build-time body limit. Either cap `FORMLENS_MAX_UPLOAD_MB` at runtime to the limit compiled into `next.config.ts`, or make it a Docker build ARG and document that a change needs a rebuild. Fix the "restart" comments in `next.config.ts`, `data/env/server.ts` and `.env.example`.
- `/sdd:implement T3`: add phone-width (375 px viewport) stories with assertions for the Upload step layout and `FieldsToFindCard` (stacked panels, `scrollWidth <= clientWidth`) to cover AC35. Add AC35 to plan.md.
- `/sdd:implement T1` (acceptable): update the 202 description at `router.py:35` and `apps/api/README.md:345-347,385-392` (cancel route, `cancelled` status, "until completed, failed or cancelled"). Then run `make openapi` and `npm run generate -w @form-lens/api-client`.
- `/sdd:implement T4` (acceptable): mock HTTP in `extraction-status-view.stories.tsx` with MSW, or record an exception.
- `/sdd:implement T4` (acceptable): prove the 3000 ms polling interval with fake timers in a unit test, and drop the elapsed-time bounds from ReopenedWhileRunning.
- Fix (acceptable): add `coverage-unit` to `apps/studio/.gitignore`, `biome.json` and `knip.json`.

### Warnings

- Studio minors:
  - `load-template.ts:24` returns `response.data` without a schema parse (outside the diff).
  - `CancelResult` (`schemas/extraction.ts:88-95`) is not a Zod schema.
  - The default `cancelMock` never resolves.
  - The E2E fallback uses `localhost`, not `127.0.0.1`; `next start` is used with `output: standalone`.
  - String unions where as-const objects are expected (`load-extraction.ts:12-15`, `extraction-poller.ts:9-12`).
  - `extraction-poller.ts` is in `hooks/` but is not a hook.
  - `//` comment at `upload-form.tsx:58`.
  - Stories build FIELDS inline instead of using builders.
- api minor: `schemas.py:51` has no `examples`. Proposals: strip NUL and control characters in `upload_filename` (`model.py:61`); `ExtractionFieldResponse.type` is a plain `str`.
- QA low: `status-steps.ts` `STEPS_BEHIND[cancelled]=4` marks "Waiting in queue" and "Reading document" as completed for a job cancelled while pending (failed behaves the same).
- QA low: dev-only warning "Encountered a script tag" on `/jobs/<unknown>`.
- QA low: `next dev` writes an untracked `apps/studio/AGENTS.md`.
- QA low: the E2E test fails with the repo config when `next dev` runs on 127.0.0.1 (Next 16 `allowedDevOrigins`).
- Drift items under Spec compliance: fix the E2E file name in `plan.md:102` and `tasks.md:160`, and the T2 path list.
