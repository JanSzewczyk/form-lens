# Feature: New Document Upload Flow

**Branch:** feature/new-document-upload-flow
**Status:** in-progress  <!-- draft → clarified → planned → in-progress → done; each /sdd command advances it -->
**Type:** feat  <!-- feat | fix | chore | refactor | docs -->
**Owner:** JanSzewczyk
**Created:** 2026-11-26

---

## Summary (business)

Studio users can pick a form, upload a document to be read against it, and follow the extraction's live status until it completes or fails.

## User stories

- As a **Studio user**, I want **to pick the form a document should be read with**, so that **the API knows which fields to find**.
- As a **Studio user**, I want **to upload a document and start its analysis in a few clicks**, so that **I do not retype its data by hand**.
- As a **Studio user**, I want **to see the live status of my extraction**, so that **I know when the result is ready or why it failed**.
- As a **Studio user**, I want **to see the values found when the extraction completes**, so that **I can check and use them right away**.
- As a **Studio user**, I want **to cancel an extraction I started by mistake**, so that **it is not read and does not hold a place in the queue**.
- As a **Studio user**, I want **to come back to an extraction's status page by its address**, so that **leaving the page does not lose track of the job**.

## Functional requirements

- [ ] FR1: New document is a flow of three steps shown in a stepper: Choose form → Upload document → Results. The stepper marks the current and the completed steps; it is not clickable.
- [ ] FR2: Choose form step: a card per form with its name, description and field count, a name search, paging beyond the first page and a Select action; an empty state with a way to create the first form.
- [ ] FR3: "Use form" on a Forms card opens the Upload step with that form selected (today it leads to the placeholder).
- [ ] FR4: Upload step: the selected form with its field count and a "Change form" action; a "Fields to find" panel with each field's key and type in form order; a drop zone for one file (PDF, PNG, JPEG or TIFF) with a hint of the size limit; the chosen file shown with its name, size and a Remove action; "Start analysis" and "Cancel".
- [ ] FR5: The size limit is a Studio setting, 25 MB by default (the API's default `max_upload_mb`); the file type and size are checked before the upload.
- [ ] FR6: "Start analysis" submits the document for extraction against the selected form and opens the status page of the new extraction.
- [ ] FR7: Status page: one address per extraction, in the Jobs section, with the breadcrumb "Jobs / <extraction id>" (Jobs leads to the Jobs placeholder). It shows the uploaded file's name, the form's name, when the document was submitted, a status badge and a stepper of the real statuses: Uploaded → Waiting in queue (`pending`) → Reading document (`running`) → Done / Failed / Cancelled.
- [ ] FR8: While the extraction is unfinished, the status is checked again every 3 seconds without a reload; checks stop once it is completed, failed or cancelled, and pause while the browser tab is hidden.
- [ ] FR9: Results panel: while unfinished, a placeholder per form field; when completed, every form field in form order with its value, fields without a value marked "Not found" and required fields without a value marked "Missing required"; a "New document" action.
- [ ] FR10: Failed extraction: the API's error message and a "Try again" action that opens the Upload step with the same form.
- [ ] FR11: "Cancel job" on an unfinished extraction, with a confirmation; a cancelled extraction shows as cancelled.
- [ ] FR12: API extension: a client can cancel a `pending` or `running` extraction; it gets the new status `cancelled`, is not read further and gets no result; a completed, failed or cancelled one cannot be cancelled. The list's status filter accepts `cancelled`.
- [ ] FR13: API extension: an extraction keeps the original name of the uploaded file and returns it; it also returns the form name and fields (name, type, required) it was read with.

## Acceptance criteria

<!-- Concrete, measurable. Each AC maps to one test. Ids are stable: never renumber or reuse one. -->

- [x] AC1: given the user clicks New document in the navigation → the Choose form step lists a card per form with name, description and "N fields", and the stepper marks Choose form as current.
- [x] AC2: given forms "VAT invoice" and "Lease agreement" and the search "invoice" → only "VAT invoice" is listed (case-insensitive, part of the name).
- [x] AC3: given no forms → the Choose form step shows an empty state with a link to New form; given a search with no match → it shows "no forms match" instead.
- [x] AC4: given more forms than fit one page → the user can load the next page and sees all of them.
- [x] AC5: given the user selects a form with 8 fields → the Upload step shows its name, "8 fields" and the Fields to find panel with the 8 keys and types in form order; the stepper marks Choose form completed and Upload document current.
- [x] AC6: given the user clicks "Use form" on a Forms card → the Upload step opens with that form selected.
- [x] AC7: given the Upload step → "Change form" returns to the Choose form step, and "Cancel" returns to the Forms page; nothing is submitted.
- [x] AC8: given the Upload step opened for a form that does not exist → a "form not found" message with a link back to Choose form is shown.
- [x] AC9: given no file chosen → "Start analysis" is disabled.
- [x] AC10: given the user drops a 2 MB PDF → it is shown with its name and "2 MB" and "Start analysis" is enabled; Remove returns to the empty drop zone.
- [x] AC11: given a file that is not PDF, PNG, JPEG or TIFF (e.g. `.docx`) → it is refused before any upload with a message naming the accepted types.
- [x] AC12: given a file larger than the size limit → it is refused before any upload with a message giving the limit in MB.
- [x] AC13: given a file is chosen and the user chooses another → only the new file is kept.
- [x] AC14: given a valid file and "Start analysis" → the extraction is created and the user lands on its status page, whose address holds the extraction id.
- [x] AC15: given the API refuses the file (empty, too large, unsupported type) → its message is shown at the drop zone and the form and file stay chosen.
- [x] AC16: given the form was deleted before the submit → the user is told the form no longer exists and is offered Choose form.
- [x] AC17: given the API answers that the queue is full with a wait time of N seconds → the user is told to try again in N seconds and the input stays.
- [x] AC18: given the API is unavailable at submit → an error message is shown and the input stays.
- [x] AC19: given a `pending` extraction → the stepper shows Uploaded completed and Waiting in queue current, the badge says waiting, and the Results panel shows a placeholder per form field.
- [x] AC20: given a `running` extraction → the stepper shows Reading document as current.
- [x] AC21: given the status page is open and the extraction moves from `pending` to `running` to `completed` → each change shows without a reload within 3 seconds.
- [x] AC22: given the extraction is completed, failed or cancelled → no further status checks are made.
- [x] AC23: given the browser tab is hidden → no status checks run; when it becomes visible → one check runs at once and the 3-second checks resume.
- [x] AC24: given a completed extraction with result `{"invoice_number": "FV/1/2026", "paid": null}` where `paid` is not required → the Results panel lists `invoice_number` = "FV/1/2026" and `paid` "Not found", in form order, and the stepper shows Done.
- [x] AC25: given a completed extraction with `missing_required: ["due_date"]` → `due_date` is marked "Missing required" and the page says 1 required field was not found.
- [x] AC26: given a failed extraction with an error message → the page shows that message, and "Try again" opens the Upload step with the same form.
- [x] AC27: given the status page of an unfinished extraction is reloaded or opened later by its address → it shows the current status and the checks resume.
- [x] AC28: given an unknown extraction id, or one whose result expired → the page says the extraction was not found or has expired and links to New document.
- [x] AC29: given the API cannot be reached while the status page is open → a notice says the status cannot be refreshed, the checks continue, and the notice disappears once the API answers again.
- [x] AC30: given an unfinished extraction and "Cancel job" → a confirmation is shown; confirming shows the extraction as cancelled and stops the checks; dismissing changes nothing.
- [x] AC31: given a completed, failed or cancelled extraction → "Cancel job" is not shown.
- [x] AC32: given the API: cancelling a `pending` extraction → it is reported as cancelled and the worker never reads it.
- [x] AC33: given the API: cancelling a completed, failed or already cancelled extraction → the request is refused as a conflict and the extraction is unchanged.
- [x] AC34: given the API: cancelling an unknown extraction id → not found.
- [ ] AC35: given a phone-width screen → the flow's steppers and panels stack and no page scrolls horizontally.
- [x] AC36: given the API: cancelling a `running` extraction → its status becomes `cancelled` and it never gets a result, even if the worker finishes reading afterwards.
- [x] AC37: given the API: one cancelled extraction and `GET /v1/extractions?status=cancelled` → it is listed, and `total` counts it.
- [x] AC38: given the API: a document uploaded as `invoice_118_2026.pdf` → the created extraction, and later reads of it, return the file name `invoice_118_2026.pdf`.
- [x] AC39: given the status page of an extraction of `invoice_118_2026.pdf` with the form "VAT invoice" → it shows "invoice_118_2026.pdf · VAT invoice", also after a reload.

## Edge cases

<!-- What if: no network, race condition, invalid input, concurrent users, ... -->

- The form is edited after the submit: the extraction keeps the form version it was submitted with; the Results panel follows that version's fields.
- The extraction completes between the user clicking "Cancel job" and confirming: the cancel is refused and the page shows the completed result.
- The worker finishes reading a `running` extraction just after it was cancelled: it stays `cancelled` (AC36).
- The uploaded file name holds characters such as quotes or HTML: it is shown as plain text.
- An extraction created before the file name was kept has no file name: the status page shows only the form.
- The Studio size limit differs from the API's `max_upload_mb`: the API's refusal (AC15) still covers it.
- A file with a valid extension but other content is refused by the API (the API reads the type from the bytes) → AC15.
- The user leaves the status page: the extraction carries on; the address brings them back (AC27).
- A completed result expires after `result_ttl_hours` → AC28.
- The browser tab stays hidden for a long time: no checks run until it is visible (AC23).

## Non-goals (out of scope)

<!-- What this feature does NOT do. Protects against scope creep. -->

- The full Results screen of the design (board "5 · Results"): confidence, page numbers, document preview, Copy / Download JSON.
- A progress percentage, an estimated time left and the design's sub-steps (text extraction, field search, result verification); the API reports only statuses.
- The Jobs list; the Jobs navigation item stays a placeholder.
- Uploading several files at once.
- Editing or correcting extracted values.
- Reading the size limit or accepted types from the API.
- Showing the document's page count.

## Open questions

<!-- The /sdd:clarify phase fills these in. The owner answers them BEFORE /sdd:plan. -->

- None.

## Dependencies & prerequisites

<!-- What must be ready beforehand (other features, env vars, infra). -->

- The API changes (FR12–FR13, AC32–AC34, AC36–AC38) must land and the api-client must be regenerated before the Studio uses it.
- The Studio app shell, Forms list and editor (`specs/studio-app-shell`, done).
- `GET /v1/extractions/{id}` and `POST /v1/extractions` (exist); the extractions list (`specs/list-extractions-pagination-filters`) is not needed.
- `@szum-tech/design-system` (Stepper, FileUpload and the other components of the design).

## Notes

<!-- Links: designs, API specs, ADRs -->

- Design: https://claude.ai/artifact/BVaaT7mhUM2iBjrMn9cfz4 — boards "3 · Upload document" and "4 · Processing" are in scope; "5 · Results" is not. Step 1 "Choose form" has no board; it follows the Forms cards of "1 · Forms".
- "Form" in the design = "template" in the API; "job" = "extraction".
- The design's "max 50 MB" and "PDF only" are replaced by the API's rules (owner's decision).
