# Plan: List Extractions With Pagination And Filters

**Spec:** `specs/list-extractions-pagination-filters/spec.md`
**Status:** tasks-ready

## High-level approach

Add `GET /v1/extractions` (`list_extractions`) to the hexagonal `extractions` module, following the existing
`list_templates` route: router → one service method → a new repository port method that returns `(items, total)`
from one read session. Filtering, ordering, paging and counting happen in SQL, so `total` and page boundaries are
correct; filtering in the service after the query was rejected because it breaks both.

Expiry (FR7, AC13) is applied in the query as a cutoff: the service computes `cutoff = clock() - result_ttl` and the
repository keeps rows with `finished_at IS NULL OR finished_at > cutoff`, which is exactly the negation of
`Extraction.is_expired` (`now >= finished_at + ttl`). Rejected alternatives: filtering expired rows in Python
(wrong `total`) and relying on the purge (rows live until the worker runs). Order is `created_at DESC, id DESC`
(stable tie-break, FR2). `status` is a repeatable `list[ExtractionStatus]` query parameter; the app-wide
`reject_repeated_query_parameters` (`query.py`) already lets array-typed parameters repeat. Duplicated values are
collapsed in the service. No schema change: `ix_extractions_status_created_at_id` serves status filters; the other
queries scan a table that the purge keeps small (spec non-goal).

## Contracts

- **Port** `ExtractionRepository.page(*, statuses: frozenset[ExtractionStatus], template_id: UUID | None,
  finished_after: datetime, limit: int, offset: int) -> tuple[list[Extraction], int]` — provided by the SQLite
  adapter and `FakeExtractionRepository`; consumed by `ExtractionService.page`. Empty `statuses` = no status filter.
- **HTTP** `GET /v1/extractions?status=…&status=…&template_id=…&limit=…&offset=…` → 200 `ExtractionPage`
  (`Page[ExtractionResponse]`: `items`, `total`, `limit`, `offset`), 422 Problem Details (`VALIDATION_ERROR`).
- **Generated client** — `apps/api/openapi.json` (`make openapi`) → `packages/api-client/src/generated`
  (`npm run generate -w @form-lens/api-client`): new `listExtractions(params)` and `ListExtractionsParams`.

## File-by-file change list

### api (backend · apps/api)
- `src/formlens/extractions/domain/ports.py` — add `page(...)` to `ExtractionRepository` [**contract**]
- `src/formlens/extractions/adapters/sqlite_repository.py` — `page`: WHERE status IN / template_id / expiry cutoff, ORDER BY created_at DESC, id DESC, LIMIT/OFFSET plus `func.count()` in one read session (reuses `SqliteTemplateRepository.page` in `templates/repository.py`)
- `src/formlens/extractions/service_layer/service.py` — `ExtractionService.page(statuses, template_id, limit, offset)`: dedups statuses, cutoff from `clock` and `result_ttl`
- `src/formlens/extractions/entrypoints/schemas.py` — `ExtractionPage(Page[ExtractionResponse])` (mirrors `TemplatePage`, `templates/schemas.py:191`) [**contract**]
- `src/formlens/extractions/entrypoints/router.py` — `list_extractions` on `GET ""`: `PageParams` via `get_page_params`, `status: list[ExtractionStatus] | None = Query(None)`, `template_id: UUID | None`, `responses={422: problem_response(VALIDATION_ERROR)}` [**contract**]
- `openapi.json` — regenerated with `make openapi`, never by hand [**contract**]
- `tests/extractions/fakes.py` — `FakeExtractionRepository.page` with the same rules
- `tests/extractions/test_repository_contract.py` — fake and SQLite: order and tie-break, each filter, AND/OR combination, `total` with filters, offset past the end, expiry boundary (`finished_at == cutoff` is excluded; pending/running never are)
- `tests/extractions/test_service.py` — cutoff taken from `FakeClock` and `result_ttl`, duplicate statuses collapsed
- `tests/extractions/test_api.py` — AC1–AC10, AC12, AC13 through HTTP; drop `collection-get` from the 405 parametrization (`:454`) and set `Allow` of `collection-put`/`collection-delete` to `GET, POST`; add `list_extractions` to the spec-route test (`:355`)
- `tests/test_health.py` — add `("/v1/extractions", "get")` to the committed route set (`:163`)
- `README.md` — route table row after `:344` and the "Field extraction" bullet (`:58`) mention the list (`tests/test_docs.py` checks only make targets)

### @form-lens/api-client (library · packages/api-client)
- `src/generated/**` — regenerated with `npm run generate -w @form-lens/api-client`, never by hand
- `src/index.test.ts` — `listExtractions({ status: ["pending", "running"], template_id, limit })` puts `status` twice in the URL (reuses `stubFetch` / `requestedUrl`)

## Risks & mitigations

- **Risk:** Orval 8.47 may serialize an array query parameter as `status=pending,running` (one value), which FastAPI reads as an invalid status → 422 for every multi-status call from the Studio. **Mitigation:** the `index.test.ts` case asserts the repeated form; if it fails, set `explode`/`style: form` explicitly on the parameter in the OpenAPI (FastAPI `openapi_extra` or a param override in `orval.config.ts`) rather than accept comma lists in the API.
- **Risk:** the expiry rule now lives twice (domain `is_expired`, SQL cutoff) and can drift. **Mitigation:** contract tests at the exact boundary, and an API test that one extraction is both absent from the list and 404 by id.
- **Risk:** `reject_repeated_query_parameters` may still 422 a repeated array param in this route. **Mitigation:** AC12 API test covers it; fix in `query.py` only if it fails.
- **Risk:** Schemathesis now fuzzes a new GET with filters. **Mitigation:** run `make api-check` (or `make schemathesis`) before review.

## Open questions for human review

- None.

## Verification

- `cd apps/api && make check` (lint, mypy, import contracts, tests, coverage ≥ 95 %, OpenAPI drift).
- `cd apps/api && make api-check` (Spectral, oasdiff — additive change only, Schemathesis).
- `npm run generate:check -w @form-lens/api-client` and `npm run test:unit -w @form-lens/api-client`.
- Manual: `make migrate && make run`, submit two extractions, `curl 'http://127.0.0.1:8000/v1/extractions?status=pending&status=running&limit=1'`.
