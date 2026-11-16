# Tasks: List Extractions With Pagination And Filters

**Spec:** `specs/list-extractions-pagination-filters/spec.md`  **Plan:** `specs/list-extractions-pagination-filters/plan.md`

**Epic:** LEPF-86c5

## Epic: List Extractions With Pagination And Filters

### T1: `GET /v1/extractions` with status/template filters, paging and expiry
project: api
status: done
depends_on: []
acceptance: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13
plan: High-level approach; Contracts (Port, HTTP); File-by-file change list → api; Risks (expiry drift, `reject_repeated_query_parameters`, Schemathesis)
scope:
- add `ExtractionRepository.page(statuses, template_id, finished_after, limit, offset) -> (items, total)` to the port; implement it in the SQLite adapter (one read session, filters + expiry cutoff + `ORDER BY created_at DESC, id DESC` + LIMIT/OFFSET + count) and in `FakeExtractionRepository`
- `ExtractionService.page`: collapse duplicate statuses, compute cutoff from `clock()` and `result_ttl`
- `ExtractionPage` schema and `list_extractions` route on `GET ""` with repeatable `status`, optional `template_id`, shared `PageParams`, documented 422
- contract tests for fake and SQLite: order and tie-break, each filter, AND/OR, `total` under filters, offset past the end, expiry boundary (`finished_at == cutoff` excluded; pending/running never expire)
- service tests: cutoff from `FakeClock`, duplicate statuses collapsed
- API tests for AC1–AC10, AC12, AC13, plus one extraction both absent from the list and 404 by id; unknown/deleted `template_id` → 200
- update the 405 parametrization and `Allow` headers, the spec-route test and the committed route set in `tests/test_health.py`
- regenerate `openapi.json` with `make openapi`; add the route to `README.md`
- run `make check` and `make api-check` (oasdiff additive only, Schemathesis)
files: apps/api/src/formlens/extractions/**, apps/api/tests/extractions/**, apps/api/tests/test_health.py, apps/api/openapi.json, apps/api/README.md
notes: `openapi.json` is generated, never edited by hand. Fix `query.py` only if the AC12 API test shows repeated `status` is rejected.

### T2: Regenerate the api-client with `listExtractions`
project: @form-lens/api-client
status: done
depends_on: [T1]
acceptance: AC11, AC12
plan: Contracts (Generated client); File-by-file change list → @form-lens/api-client; Risks (Orval array serialization)
scope:
- run `npm run generate -w @form-lens/api-client` from the `openapi.json` produced by T1
- `index.test.ts`: `listExtractions({ status: ["pending", "running"], template_id, limit })` sends `status` twice in the URL (reuse `stubFetch` / `requestedUrl`)
- if Orval emits a comma list, set `explode`/`style: form` in `orval.config.ts` (preferred) or on the parameter in the API, then regenerate
- run `npm run generate:check` and `npm run test:unit` in the workspace
files: packages/api-client/src/generated/**, packages/api-client/src/index.test.ts, packages/api-client/orval.config.ts
notes: `src/generated` is never edited by hand. A fix on the API side touches T1's router and `openapi.json`; re-run `make openapi` and `make check` in `apps/api` then.

Order: T1 → T2
