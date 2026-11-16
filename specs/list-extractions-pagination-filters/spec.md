# Feature: List Extractions With Pagination And Filters

**Branch:** feature/list-extractions-pagination-filters
**Status:** done  <!-- draft → clarified → planned → in-progress → done; each /sdd command advances it -->
**Type:** feat  <!-- feat | fix | chore | refactor | docs -->
**Owner:** JanSzewczyk
**Created:** 2026-11-15

---

## Summary (business)

API clients (the Studio first) cannot see the extractions they have submitted unless they kept every id.
They need one paged list of extractions, filterable by status and template, to show a queue and a history.

## User stories

- As a **Studio user**, I want **to see all my extractions, newest first**, so that **I can find a result without keeping its id**.
- As a **Studio user**, I want **to filter extractions by status**, so that **I can see what is still pending or what failed**.
- As a **Studio user**, I want **to filter extractions by template**, so that **I can review every document extracted with one form**.

## Functional requirements

- [ ] FR1: `GET /v1/extractions` returns a page of extractions in the same envelope as `GET /v1/templates` (`items`, `total`, `limit`, `offset`), using the shared `limit` / `offset` query parameters.
- [ ] FR2: Items are ordered by `created_at` descending (newest first), with a stable tie-break.
- [ ] FR3: Optional query parameter `status` (one of `pending`, `running`, `completed`, `failed`) narrows the list; it may be repeated, and repeated values combine with OR.
- [ ] FR4: Optional query parameter `template_id` (UUID) narrows the list; `status` and `template_id` combine with AND.
- [ ] FR5: `total` counts the items matching the filters, across all pages.
- [ ] FR6: The route has an explicit `operation_id` (`list_extractions`), a response model and documented 422; the OpenAPI contract and the generated `@form-lens/api-client` are regenerated.
- [ ] FR7: A finished extraction past its time to live (`RESULT_TTL_HOURS`) is neither listed nor counted in `total`, the same rule under which `GET /v1/extractions/{extraction_id}` returns 404 for it.

## Acceptance criteria

- [x] AC1: given 3 stored extractions → `GET /v1/extractions` returns 200 with all 3 items, newest first, and `total` = 3.
- [x] AC2: given 0 stored extractions → 200 with `items` = [] and `total` = 0.
- [x] AC3: given 25 extractions and `limit=10&offset=20` → 5 items, `total` = 25, `limit` = 10, `offset` = 20.
- [x] AC4: given extractions in `pending` and `failed` and `status=failed` → only the failed ones, and `total` counts only them.
- [x] AC5: given extractions of templates A and B and `template_id=<A>` → only the extractions of A.
- [x] AC6: given `status=failed&template_id=<A>` → only failed extractions of A.
- [x] AC7: given `status=unknown` → 422 Problem Details.
- [x] AC8: given `template_id=not-a-uuid` → 422 Problem Details.
- [x] AC9: given `limit=0` or `limit=101` → 422 Problem Details (shared pagination rules).
- [x] AC10: each item has the same shape as the response of `GET /v1/extractions/{extraction_id}`.
- [x] AC11: `apps/api/openapi.json` and `packages/api-client/src/generated` contain `list_extractions`; `make check` and `generate:check` pass.
- [x] AC12: given extractions in `pending`, `running`, `completed` and `failed` and `status=pending&status=running` → only the pending and running ones, and `total` counts only them.
- [x] AC13: given a completed extraction whose `finished_at` is older than the TTL and one finished within the TTL → only the second is listed, and `total` = 1.

## Edge cases

- `offset` beyond `total` → 200 with empty `items` and the real `total`.
- `template_id` of a template that does not exist or was deleted → 200 with the extractions that still reference it (possibly none), not 404.
- Two extractions with the same `created_at` → order still deterministic across pages.
- An extraction changes status between two page requests → it may move between filtered pages; no snapshot consistency is promised.
- The same `status` value repeated (`status=failed&status=failed`) → same result as given once.
- An extraction that expires between two page requests → it disappears from later pages and from `total`.

## Non-goals (out of scope)

- No Studio screen for the list (separate feature).
- No cursor pagination, no sorting parameter, no full-text search.
- No filtering by date range.
- No delete, cancel or retry of extractions.
- No database schema change, indexes included: finished rows are purged after `RESULT_TTL_HOURS`, so the table stays small and no new index is added.

## Open questions

- None.

## Dependencies & prerequisites

- Existing `extractions` module (`create_extraction`, `get_extraction`) and shared pagination (`pagination.py`).

## Notes

- Pattern to follow: `list_templates` in `apps/api/src/formlens/templates/router.py`.
- After the contract change: `cd apps/api && make openapi`, then `npm run generate -w @form-lens/api-client`.