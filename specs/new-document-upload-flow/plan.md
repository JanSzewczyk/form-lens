# Plan: New Document Upload Flow

**Spec:** `specs/new-document-upload-flow/spec.md`
**Status:** in-progress

## High-level approach

**API first.**
- An extraction gets a fourth final status, `cancelled`.
- Cancelling is a conditional `UPDATE … WHERE status IN ('pending','running')`, modelled on `finish_if_running`. A worker that finishes later finds the row no longer `running`, so its result is dropped. The worker is not interrupted mid-read.
- The row stores the uploaded file name, as the basename only, at most 255 characters.
- `ExtractionResponse` exposes `filename`. It also exposes `template_name` and `fields` (name, type, required) from the submit-time snapshot the row already keeps. That lets the status page follow the version the document was read with (edge case 1), and it still renders after the form is edited or deleted.
- Rejected: reading the current template for the Results panel. It is wrong after an edit and fails after a delete.
- Cancel is `POST /v1/extractions/{id}/cancel`: 200 with the extraction, 409 `extraction-not-cancellable`, 404 `extraction-not-found`. DELETE was rejected because the record stays.

**Studio.**
- A new `features/extractions` module and two routes.
- `/documents/new` is the wizard, and the step lives in the URL:
  - without `?template` it shows Choose form;
  - with `?template=<id>` it shows Upload.
  - This way "Use form", "Change form", "Try again" and reloads all work as links, and no wizard state sits on the client.
- `/jobs/[id]` is the status page. Following board 4, it has the status stepper and no 3-step stepper.
- The upload goes through a server action, using the existing action pattern, Zod-checked responses and error mapping. `serverActions.bodySizeLimit` and `proxyClientMaxBodySize` are raised from the Studio limit (rejected: a streaming route handler, which would need its own error path).
- Polling is a client hook that `fetch`es a Studio GET route handler, `/api/extractions/[id]`, every 3 s. The handler calls the API server-side.
  - Rejected: `router.refresh()`, which re-renders the whole page and makes the outage notice hard to do.
  - Rejected: a server action, which is serialised with Cancel job.

## Contracts

- **API → api-client (generated):**
  - `ExtractionStatus` gains `cancelled`, so `ListExtractionsParams.status` also accepts it.
  - `ExtractionResponse` gains:
    - `filename: string | null` (null for rows from before this change);
    - `template_name: string`;
    - `fields: Array<{name, type, required}>`, in form order.
  - New operation `cancelExtraction`: `POST /v1/extractions/{id}/cancel`, answering 200 `ExtractionResponse`, 404 or 409 Problem Details.
  - The provider is `apps/api` through `make openapi`. The consumer is `packages/api-client` through `npm run generate`, used by the Studio via `lib/formlens-api.ts`.
- **Studio internal:** `GET /api/extractions/[id]` → `200 ExtractionView | 404 {notFound} | 502 {unreachable}`.
  - `ExtractionView` is a Zod schema in `features/extractions/schemas`.
  - It is served by the route handler and read by `use-extraction-status`.
- **DB:** migration `v0003`:
  - adds `extractions.filename VARCHAR(255) NULL`;
  - widens the `status_known` CHECK to include `cancelled`, using batch mode because this is SQLite.

## File-by-file change list

### api (backend · apps/api)
- `src/formlens/extractions/domain/model.py` — `CANCELLED` status; `Extraction.cancel(now)` guarded by `_require` (unfinished only); `filename` attribute.
- `src/formlens/extractions/domain/exceptions.py` — `ExtractionNotCancellable`.
- `src/formlens/extractions/domain/ports.py` — `cancel_if_unfinished(id, now) -> Extraction | None` on `ExtractionRepository`.
- `src/formlens/extractions/adapters/tables.py` — `filename` column; `cancelled` in `status_known`.
- `src/formlens/extractions/adapters/sqlite_repository.py` — `cancel_if_unfinished` (conditional UPDATE + delete the input row, as in `finish_if_running`); `filename` in add/read mapping.
- `src/formlens/migrations/versions/v0003_extraction_cancel_filename.py` — the column and the CHECK (new revision; 0001 is frozen).
- `src/formlens/extractions/service_layer/service.py` — `submit` takes `filename`; `cancel(id)` → not found / not cancellable / cancelled.
- `src/formlens/extractions/entrypoints/router.py` — pass `file.filename` (basename, trimmed) to `submit`; new `cancel_extraction` route with `operation_id`, `responses` 404/409/422.
- `src/formlens/extractions/entrypoints/schemas.py` — `filename`, `template_name`, `fields` on `ExtractionResponse` (`from_domain`).
- `src/formlens/extractions/entrypoints/errors.py` — `EXTRACTION_NOT_CANCELLABLE` `ProblemType` (409) mapped from `ExtractionNotCancellable`.
- `docs/reference/problem-types.md` — row for `extraction-not-cancellable`.
- `openapi.json` — regenerated (`make openapi`) [**contract**].
- `tests/extractions/factories.py` — `filename`, cancelled state.
- `tests/extractions/test_model.py` — `cancel` transitions (pending/running ok; final → error).
- `tests/extractions/test_repository_contract.py` / `test_adapters.py` — `cancel_if_unfinished`, filename round-trip, purge of cancelled rows (uses `finished_at`).
- `tests/extractions/test_service.py` — `cancel` paths and `filename` passed through.
- `tests/extractions/test_api.py` — AC32–AC34, AC37 (`?status=cancelled`, `total`), AC38 (filename incl. path and >255 chars).
- `tests/extractions/test_concurrency.py` — cancel vs `finish_if_running` race, worker result never overwrites `cancelled` (AC36), proved by removing the guard.
- `tests/migrations/test_migrations.py` — v0003 up/down on a DB with 0002 rows (null filename).

### @form-lens/api-client (library · packages/api-client)
- `src/generated/**` — regenerated with `npm run generate`; never edited by hand [**contract**].

### @form-lens/studio (web · apps/studio)
- `data/env/server.ts` — `FORMLENS_MAX_UPLOAD_MB` (int, default 25).
- `next.config.ts` — `experimental.serverActions.bodySizeLimit` and `experimental.proxyClientMaxBodySize` = limit + 1 MB (multipart overhead), read from `process.env`.
- `.env.example` — `FORMLENS_MAX_UPLOAD_MB`.
- `features/extractions/schemas/extraction.ts` — Zod `ExtractionView`, `SubmitResult`, `CancelResult`.
- `features/extractions/utils/accepted-file.ts` — accepted MIME/extensions and `checkFile(file, maxMb)`; used by the drop zone and the action.
- `features/extractions/utils/status-steps.ts` — status → stepper item states and badge (Uploaded / Waiting / Reading / Done·Failed·Cancelled).
- `features/extractions/utils/result-rows.ts` — `fields` + `result` + `missing_required` → rows (value / Not found / Missing required).
- `features/extractions/utils/extraction.builder.ts` — mimicry-js builder (reuses the style of `template.builder.ts`).
- `features/extractions/server/load-extraction.ts` — `server-only`, `React.cache`, `getExtraction` → `ExtractionView | notFound | unreachable`.
- `features/extractions/server/map-extraction-error.ts` — 400/404/413/415/422 → drop-zone message, 404 template → form gone, 503 + `Retry-After` → wait N s, unreachable (reuses `mapProblem`/`mapUnreachable` from `features/templates/server/map-service-error.ts`).
- `features/extractions/server/extraction-actions.ts` — `"use server"`: `submitExtraction` (re-checks the file, calls the API, `redirect` to `/jobs/<id>` from `Location`), `cancelExtraction` (reuses the `template-actions.ts` pattern).
- `features/extractions/hooks/use-extraction-status.ts` — 3 s polling of the route handler, stops on a final status, pauses on `visibilitychange` and fetches once on return, `unreachable` flag (AC21–AC23, AC29).
- `features/extractions/components/new-document-stepper.tsx` — 3-step non-interactive `Stepper`.
- `features/extractions/components/choose-form-list.tsx` — form cards with Select (link to `?template=<id>`), empty and no-match states (reuses `template-search.tsx`, `template-pager.tsx`).
- `features/extractions/components/selected-form-item.tsx` — `Item` with field count and Change form.
- `features/extractions/components/fields-to-find-card.tsx` — key + type `Badge` list.
- `features/extractions/components/upload-form.tsx` — client: `FileUpload` (one file), selected-file `Item` with Remove, client checks, `useActionState` submit, error at the drop zone, Cancel → `/forms`.
- `features/extractions/components/extraction-status-view.tsx` — client: header, `filename · template_name` (plain text), badge, Cancel job, outage notice; driven by the hook.
- `features/extractions/components/status-stepper.tsx` — the real-status `Stepper`.
- `features/extractions/components/results-card.tsx` — `Skeleton` per field while unfinished, rows when completed, missing-required summary, New document.
- `features/extractions/components/extraction-failed.tsx` — API message + Try again (`/documents/new?template=<id>`).
- `features/extractions/components/cancel-job-dialog.tsx` — confirmation dialog calling `cancelExtraction`; a 409 refetches and shows the final (e.g. completed) result.
- `features/extractions/components/*.stories.tsx` — stories with interaction tests per component above (pending/running/completed/failed/cancelled/unreachable).
- `features/extractions/**/*.test.ts` — unit tests for utils, `load-extraction`, `map-extraction-error`, actions, hook.
- `app/(shell)/documents/new/page.tsx` — replaces `ComingSoon`; `?template` absent → Choose form (`loadTemplates`), present → Upload (`loadTemplate`), unknown → AC8 message.
- `app/(shell)/jobs/[id]/page.tsx` — server load for the first render, then `ExtractionStatusView`; not found / expired → AC28.
- `app/api/extractions/[id]/route.ts` — GET, `force-dynamic`, `Cache-Control: no-store`, calls `load-extraction`.
- `app/api/extractions/[id]/route.test.ts` — 200 / 404 / 502.
- `components/layout/app-breadcrumbs.tsx` — `/jobs/<id>` → "Jobs / <id>"; `/documents/new` keeps its section crumb.
- `features/templates/components/template-card.tsx` — Use form → `/documents/new?template=<id>` (AC6).
- `tests/e2e/new-document.spec.ts` — happy path: Use form → upload → status → completed (API mocked or fake extractor).

## Risks & mitigations

- **Risk:** `bodySizeLimit` and `proxyClientMaxBodySize` are read when `next.config.ts` loads. A change to `FORMLENS_MAX_UPLOAD_MB` therefore needs a restart, and Docker reads them at runtime start. **Mitigation:** read them from `process.env` in the config, with a 25 MB fallback, and document the restart in `.env.example`.
- **Risk:** the 25 MB file is held in memory by the Studio server, then sent again to the API. **Mitigation:** accept this. There is one file per request, and the API's own limit stays the backstop.
- **Risk:** the worker keeps reading a cancelled `running` job, so the CPU or VLM time is spent anyway. **Mitigation:** accepted for this spec (AC36 only promises no result). Interrupting the worker is a later change.
- **Risk:** the SQLite CHECK change needs a table rebuild in batch mode. **Mitigation:** a migration test that runs on a database holding 0002 rows, both up and down. On down, `cancelled` rows become `failed` with `error_reason='interrupted'` (no CHECK ties `failed` to an error).
- **Risk:** oasdiff (`--fail-on ERR`) may flag the new response enum value `cancelled`. **Mitigation:** it is a warning, not an error, in oasdiff's rules; if `make openapi-check` fails, add the change id to `oasdiff-ignore.txt` with the reason.
- **Risk:** polling from many open tabs. **Mitigation:** the hook pauses while the tab is hidden and stops on a final status. The handler returns `no-store` and does no other work.
- **Risk:** the file name is HTML or quotes. **Mitigation:** it is rendered as React text only. The API stores the basename, trimmed to 255 characters.

## Open questions for human review

- None.

## Reference sources

Design https://claude.ai/artifact/BVaaT7mhUM2iBjrMn9cfz4. Only boards 3 and 4 are in scope.

- **Shell and breadcrumbs:**
  - Upload: the breadcrumb is `BreadcrumbPage` "New document", and the sidebar marks New document.
  - Processing: the breadcrumb is "Jobs" (link) / `<id>`, and the sidebar marks Jobs.
- **3 · Upload:**
  - Page header: H1 "New document" with the subtitle "Upload a document and the API will find the fields defined in the selected form."
  - Horizontal `Stepper`, non-interactive, `aria-label="Steps"`: Choose form ✓ · Upload document (current) · Results.
  - Left column (flex 999 1 520px, gap 20):
    - `Item` outline: icon, form name, "N fields to find", ghost sm "Change form".
    - `FileUpload` with max-files 1 and a dropzone padded 40/24: "Drag a file here" / "or click to choose it from your computer · max N MB".
    - Selected-file `Item` outline: the name in font-code, then "size · ready for analysis", then a ghost icon "Remove file".
    - Buttons: default lg "Start analysis" and ghost lg "Cancel".
  - Right column: `Card` (flex 1 1 300px) titled "Fields to find", described as "From the “<form>” form". Each row is the key in text-code plus a `Badge` outline with the type.
- **4 · Processing:**
  - Page header: H1, the subtitle "…the status refreshes automatically.", and a header action, outline "Cancel job". There is no 3-step stepper.
  - Left `Card`, a status row: a 48 px muted box with a `Spinner`, an h4 status line, "file · form" in font-code, and a `Badge` (primary "In progress").
  - Below the status row: the status `Stepper`, which replaces the design's progress bar and sub-steps.
  - Footer with a top border: "Polling job status every 3 seconds" and the id in mono.
  - Right `Card`: "Results" with "Data will appear here when the analysis finishes." Each row is the key (text-small font-code) above a `Skeleton` (18 px tall, 70 % wide, radius 6).
- **1 · Forms card:** CardFooter with "Use form" (default sm) and "Edit" (outline sm).
