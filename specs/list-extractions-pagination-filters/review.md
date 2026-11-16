# Review: List Extractions With Pagination And Filters

**Branch:** feature/list-extractions-pagination-filters
**Date:** 2026-11-16
**Verdict:** READY

## Spec compliance (spec-verifier)
| AC | Status | Evidence |
|----|--------|----------|
| AC1–AC13 | met | spec-verifier `satisfied: true`; route `list_extractions` in `apps/api/src/formlens/extractions/entrypoints/router.py:93`, repository `page` in `adapters/sqlite_repository.py:115`, tests in `tests/extractions/test_api.py`, `test_repository_contract.py`, `test_service.py`, `packages/api-client/src/index.test.ts:42` |

- Out of scope / non-goal violations: none in feature code. Outside the feature: SDD setup (`.github/workflows/sdd-check.yml`, `specs/capabilities.yml`, deleted `specs/capabilities.md`); repository tooling, no product code, no non-goal touched (no schema/index change, no Studio screen).
- Drift: `tasks.md` T2 `files` lists `orval.config.ts`, unchanged (conditional change not needed); `spec.md` AC/FR checkboxes still `[ ]` (ticked by the lead in step 4).

## Tests
- api: 1420 passed, 10 deselected (slow) · coverage 99 % (target ≥ 95 %, branch). One flake on the first run: `tests/extractions/test_lifespan.py::test_a_parser_that_stays_busy_does_not_make_the_worker_spin_and_the_job_completes_when_it_frees_up` (file not touched by this feature; 3/3 in isolation, full suite green on rerun).
- @form-lens/api-client: 17 passed · coverage 100 % (target 100 % of hand-written code) · `tsc --noEmit` clean · `generate:check` clean.

## Constitution rules
- DO NOT rename the `Check ✅` or `Audit 🔒` jobs — respected (only a new workflow `sdd-check.yml`, job `SDD Artifacts 🧭`; existing jobs unchanged).
- DO NOT edit `packages/api-client/src/generated` or `apps/api/openapi.json` by hand — respected (`export_openapi --check` and `generate:check` pass).
- DO NOT put a client-supplied regular expression outside `patterns.py` — respected (no regex in the diff).
- DO NOT edit migration `v0001_initial.py` after first merge/deploy — respected (no migration touched).
- DO NOT change the uv version in only one place — respected (no Dockerfile/`UV_VERSION` change).
- DO NOT expect Dependabot to bump Spectral/oasdiff/pip-audit/`huggingface_hub` pins — respected (no pin touched).
- DO NOT use `&&` for conditional rendering in the Studio — respected (Studio not touched).
- DO NOT run `template-sync` — respected.
- §4 api route conventions — respected: explicit `operation_id="list_extractions"`, `response_model=ExtractionPage`, 422 documented via `problem_response(VALIDATION_ERROR)` (`router.py:93-98`); route calls one service method; docstring has no `Args:`/`Returns:`.

## Audits
- python:python-reviewer (api): Approve — 0 red, 0 yellow, 2 blue. ruff, mypy, lint-imports, export_openapi --check pass; mutations on expiry boundary, tie-break and total killed.
  - blue: `router.py:102-111` `status` and `template_id` Query params have a description but no example (shared `limit`/`offset` have one).
  - blue: `apps/api/README.md:24` edited line is 153 chars vs ~120 wrap.
- typescript:unit-testing (@form-lens/api-client, auto by stack): pass — new test asserts observable request URL, can fail on a comma-joined `status`, straight-line AAA. 1 blue: `index.test.ts:42` uses `it()` (skill prefers `test()`), consistent with the rest of the file.
- Extra checks: none configured. Not run locally: Schemathesis, Spectral, oasdiff (CI `API contract 📜` covers them).

## Accepted
<!-- none -->

## Verdict
READY ✅ — all checks green. Optional:
- Add `examples` to `status` and `template_id` Query params (`router.py:102-111`).
- Rewrap `apps/api/README.md:24` to ~120 chars.
- Track the timing flake in `tests/extractions/test_lifespan.py` (outside this feature).
