import type { ExtractionResponse } from "@form-lens/api-client";
import { describe, expect, test as it } from "vitest";

import { ExtractionViewStatus } from "~/features/extractions/schemas/extraction";
import { extractionResponseBuilder } from "~/features/extractions/utils/extraction.builder";

import { describeMissingRequired, getResultRows, ResultRowState } from "./result-rows";

function completed(overrides: Partial<ExtractionResponse>) {
  return extractionResponseBuilder.one({ overrides: { status: ExtractionViewStatus.completed, ...overrides } });
}

describe("getResultRows", () => {
  it("lists the value of a found field and Not found for a null optional one, in form order (AC24)", () => {
    const extraction = completed({
      fields: [
        { name: "invoice_number", required: true, type: "text" },
        { name: "paid", required: false, type: "boolean" }
      ],
      result: { invoice_number: "FV/1/2026", paid: null }
    });

    expect(getResultRows(extraction)).toEqual([
      { name: "invoice_number", state: ResultRowState.found, value: "FV/1/2026" },
      { name: "paid", state: ResultRowState.notFound, value: null }
    ]);
  });

  it("marks a field the API lists in missing_required as Missing required (AC25)", () => {
    const extraction = completed({
      fields: [
        { name: "invoice_number", required: true, type: "text" },
        { name: "due_date", required: true, type: "date" }
      ],
      missing_required: ["due_date"],
      result: { due_date: null, invoice_number: "FV/1/2026" }
    });

    const rows = getResultRows(extraction);

    expect(rows.map((row) => row.state)).toEqual([ResultRowState.found, ResultRowState.missingRequired]);
    expect(describeMissingRequired(rows)).toBe("1 required field was not found");
  });

  it("marks a required field as Missing required when the result has no key for it at all (AC25)", () => {
    const extraction = completed({
      fields: [
        { name: "invoice_number", required: true, type: "text" },
        { name: "due_date", required: true, type: "date" }
      ],
      missing_required: ["due_date"],
      result: { invoice_number: "FV/1/2026" }
    });

    const rows = getResultRows(extraction);

    expect(rows.at(-1)).toEqual({ name: "due_date", state: ResultRowState.missingRequired, value: null });
    expect(describeMissingRequired(rows)).toBe("1 required field was not found");
  });

  it("follows the submitted form's fields, not the keys of the result (form edited after the submit)", () => {
    const fields = [
      { name: "issue_date", required: false, type: "date" },
      { name: "invoice_number", required: true, type: "text" },
      { name: "total_gross", required: false, type: "number" }
    ];
    const extraction = completed({
      fields,
      result: { added_later: "x", invoice_number: "FV/1/2026", issue_date: "2026-11-26" }
    });

    const rows = getResultRows(extraction);

    expect(rows.map((row) => row.name)).toEqual(fields.map((field) => field.name));
    expect(rows.at(-1)).toEqual({ name: "total_gross", state: ResultRowState.notFound, value: null });
  });

  it("writes numbers, booleans, lists and objects as text", () => {
    const extraction = completed({
      fields: [
        { name: "total", required: false, type: "number" },
        { name: "paid", required: false, type: "boolean" },
        { name: "tags", required: false, type: "text" },
        { name: "address", required: false, type: "text" }
      ],
      result: { address: { city: "Gdańsk" }, paid: false, tags: ["a", "b"], total: 0 }
    });

    expect(getResultRows(extraction).map((row) => row.value)).toEqual(["0", "false", '["a","b"]', '{"city":"Gdańsk"}']);
  });

  it("gives Not found for every field while there is no result", () => {
    const extraction = completed({ fields: [{ name: "invoice_number", required: true, type: "text" }], result: null });

    expect(getResultRows({ ...extraction, missing_required: undefined })).toEqual([
      { name: "invoice_number", state: ResultRowState.notFound, value: null }
    ]);
  });
});

describe("describeMissingRequired", () => {
  it("says nothing when every required field was found and counts in the plural from two", () => {
    const extraction = completed({
      fields: [
        { name: "due_date", required: true, type: "date" },
        { name: "seller", required: true, type: "text" }
      ],
      missing_required: ["due_date", "seller"],
      result: { due_date: null, seller: null }
    });

    expect(describeMissingRequired(getResultRows({ ...extraction, missing_required: [] }))).toBeNull();
    expect(describeMissingRequired(getResultRows(extraction))).toBe("2 required fields were not found");
  });
});
