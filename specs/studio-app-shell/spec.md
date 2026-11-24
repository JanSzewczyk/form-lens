# Feature: Studio App Shell

**Branch:** feature/studio-app-shell
**Status:** done  <!-- draft → clarified → planned → in-progress → done; each /sdd command advances it -->
**Type:** feat  <!-- feat | fix | chore | refactor | docs -->
**Owner:** JanSzewczyk
**Created:** 2026-11-18

---

## Summary (business)

Studio users get the application foundation from the FormLens design (the navigation bar, page layout and visual style) and can view, create and edit form templates in it.

## User stories

- As a **Studio user**, I want **one consistent navigation and layout on every page**, so that **I always know where I am and can switch sections**.
- As a **Studio user**, I want **to see all form templates, search them and see when each was last used**, so that **I can find the right form for a document**.
- As a **Studio user**, I want **to create a form template by naming it and describing the fields to find**, so that **the API knows what to extract from a new document type**.
- As a **Studio user**, I want **to edit and delete an existing template**, so that **I can fix its fields or remove a form nobody uses**.

## Functional requirements

- [ ] FR1: App shell matching the design on every page: a collapsible side navigation (logo "Form Lens"; items Forms, New document, Jobs; the current section highlighted), a top bar with the navigation toggle and breadcrumbs, and an API status box at the bottom of the navigation (connected / unavailable, with the API address), refreshed periodically while the page is open.
- [ ] FR2: New document and Jobs lead to placeholder pages inside the shell that say the section is coming.
- [ ] FR3: Light and dark theme with the Szum-Tech design system look (colors, type, spacing) of the design.
- [ ] FR4: Forms page: a card per template with its name, description, field count and "Last used" date (or "Never used"), Edit and Use form actions, a total count, a search box, a "New form" button and a "New form" tile, and paging through templates beyond the first page.
- [ ] FR5: Create page: name (required), description (optional), a list of fields to find, a live preview of the API response shape, Cancel and Create form.
- [ ] FR6: Edit page: the same form filled with the template, Cancel, Save form, and Delete with a confirmation.
- [ ] FR7: Field editor: per field a key, a description of what to look for, a type (text, number, integer, boolean, date, choice), a required flag, allowed values for choice, and under "Advanced" minimum/maximum for number and integer and a pattern for text; add, remove and reorder fields; the order is the order in the API response.
- [ ] FR8: API extension: the template list accepts a name search, and each template carries the date it was last used for an extraction.

## Acceptance criteria

<!-- Concrete, measurable. Each AC maps to one test. Ids are stable: never renumber or reuse one. -->

- [x] AC1: given any Studio page → the side navigation shows Forms, New document and Jobs, and the item of the current section is marked as current.
- [x] AC2: given the navigation is open → clicking the toggle collapses it to a narrow rail with only the icons (labels in tooltips); clicking again expands it. The design system's trigger does not report its state (`aria-expanded`); accepted, see `design-system-report.md`.
- [x] AC3: given the API answers its health check → the status box shows "API connected" and the API address; given it does not → it shows the API as unavailable.
- [x] AC4: given the user clicks New document or Jobs → a placeholder page in the shell says the section is coming.
- [x] AC5: given the user switches the theme → every page renders in dark (or light) colors and the choice survives a reload.
- [x] AC6: given 3 stored templates → the Forms page shows 3 cards with name, description, "N fields" and the last-used date, and the count "3 forms".
- [x] AC7: given a template never used for an extraction → its card shows "Never used".
- [x] AC8: given templates "VAT invoice" and "Lease agreement" and the search "invoice" → only "VAT invoice" is listed; the search is case-insensitive and matches part of the name.
- [x] AC9: given more templates than fit one page → the user can load the next page and sees all of them.
- [x] AC10: given no templates → the Forms page shows an empty state with a way to create the first form.
- [x] AC11: given the API is unavailable → the Forms page shows an error message instead of the list, and the shell still works.
- [x] AC12: given the create page with name "Invoice" and one field `invoice_number` of type text → Create form stores the template and returns to the Forms list, which shows the new template and a "Form created" message.
- [x] AC13: given an empty name or no fields → Create form / Save form is refused and the missing input is pointed out next to it.
- [x] AC14: given two fields with the same key → saving is refused with a message on the duplicate key.
- [x] AC15: given a field of type choice with no allowed values → saving is refused with a message on that field.
- [x] AC16: given fields added, removed or reordered → the API response preview shows the keys in the same order with their types.
- [x] AC17: given the user clicks Edit on a template → the edit page shows its name, description and fields, including required, allowed values, minimum, maximum and pattern.
- [x] AC18: given a changed template → Save form stores it, its version goes up by one, and the list shows the new data.
- [x] AC19: given the API rejects a save (validation error) → the user sees the API's message and the entered data stays in the form.
- [x] AC20: given the user clicks Delete and confirms → the template is removed and the user is back on the Forms page without it; cancelling the dialog changes nothing.
- [x] AC21: given the user opens a template that does not exist → a "not found" page with a link back to Forms is shown.
- [x] AC22: given the API: `GET /v1/templates?search=inv` → only templates whose name contains "inv" (case-insensitive), with `total` counting only those.
- [x] AC23: given a template with extractions → the API returns its `last_used_at` as the creation time of its newest extraction; with none → `null`.
- [x] AC24: given a phone-width screen → the navigation collapses, pages have no horizontal scroll and the field editor rows stack.
- [x] AC25: given a Studio page left open → the API status is checked again every 60 seconds without a reload, so it changes to unavailable (or back to connected) within 60 seconds of the API going down (or up); checks pause while the browser tab is hidden and run once when it becomes visible again.

## Edge cases

<!-- What if: no network, race condition, invalid input, concurrent users, ... -->

- The API goes down between loading a page and saving: the save fails with a message and the input is kept.
- A template is deleted elsewhere while it is open in the editor: saving or deleting reports it as not found.
- Limits from the API: name 1–100 chars, description up to 300, 1–50 fields, up to 50 allowed values of 1–100 chars.
- Cancel with unsaved changes returns to the list without saving.
- Search with no matches shows a "no forms match" state, not the empty "create your first form" state.

## Non-goals (out of scope)

<!-- What this feature does NOT do. Protects against scope creep. -->

- The Upload document, Processing and Results screens (New document and Jobs are placeholders only).
- "Use form" starts no extraction; it leads to the New document placeholder.
- Sign-in, users and permissions.
- Template version history or restoring an older version.
- Duplicating templates.

## Open questions

<!-- The /sdd:clarify phase fills these in. The owner answers them BEFORE /sdd:plan. -->

- None.

## Dependencies & prerequisites

<!-- What must be ready beforehand (other features, env vars, infra). -->

- API contract change (FR8, AC22–AC23) must land and the generated api-client must be regenerated before the Studio uses search and last-used.
- `@szum-tech/design-system` (already a Studio dependency).

## Notes

<!-- Links: designs, API specs, ADRs -->

- Design: https://claude.ai/artifact/BVaaT7mhUM2iBjrMn9cfz4 — boards "1 · Forms", "2 · Form editor", "2b · Create new form" are in scope; "3 · Upload", "4 · Processing", "5 · Results" are not.
- "Form" in the design = "template" in the API.
- The design's field types Text / Date / Amount / Yes-No are replaced by the API's six types (owner's decision).
