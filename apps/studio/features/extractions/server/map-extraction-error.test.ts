import { describe, expect, test as it } from "vitest";

import { mapExtractionProblem, mapExtractionUnreachable } from "./map-extraction-error";

const NO_HEADERS = new Headers();

describe("mapExtractionProblem", () => {
  it.each([400, 413, 415, 422])("shows the API's message at the drop zone for a %d (AC15)", (status) => {
    expect(mapExtractionProblem(status, { detail: "The file is empty.", status, title: "Bad" }, NO_HEADERS)).toEqual({
      error: "The file is empty.",
      kind: "file",
      success: false
    });
  });

  it("falls back to its own message when the refusal has no detail", () => {
    expect(mapExtractionProblem(413, "<html>Too large</html>", NO_HEADERS)).toEqual({
      error: "The file is too large for the API.",
      kind: "file",
      success: false
    });
    expect(mapExtractionProblem(415, undefined, NO_HEADERS).error).toBe("The API did not accept this file.");
  });

  it("says the form is gone for a 404 (AC16)", () => {
    expect(mapExtractionProblem(404, { status: 404, title: "Not found" }, NO_HEADERS)).toEqual({
      error: "This form no longer exists. It may have been deleted elsewhere. Choose another form.",
      kind: "form-gone",
      success: false
    });
  });

  it("asks to try again in N seconds for a 503 with Retry-After (AC17)", () => {
    const result = mapExtractionProblem(503, {}, new Headers({ "Retry-After": "30" }));

    expect(result).toEqual({
      error: "FormLens is busy reading other documents. Try again in 30 s.",
      kind: "busy",
      success: false
    });
  });

  it.each([
    ["missing", undefined],
    ["an HTTP date", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["negative", "-5"]
  ])("asks to try again in a moment for a 503 whose Retry-After is %s", (_, value) => {
    const headers = new Headers(value === undefined ? {} : { "Retry-After": value });

    expect(mapExtractionProblem(503, {}, headers)).toEqual({
      error: "FormLens is busy reading other documents. Try again in a moment.",
      kind: "busy",
      success: false
    });
  });

  it.each([
    ["a fraction", "1.5"],
    ["digits with letters", "30abc"],
    ["too large to be exact", "1234567890123456789012345"]
  ])("asks to try again in a moment for a 503 whose Retry-After is %s", (_, value) => {
    expect(mapExtractionProblem(503, {}, new Headers({ "Retry-After": value })).error).toBe(
      "FormLens is busy reading other documents. Try again in a moment."
    );
  });

  it("reads a Retry-After with spaces around the seconds (AC17)", () => {
    expect(mapExtractionProblem(503, {}, new Headers({ "Retry-After": " 30 " })).error).toBe(
      "FormLens is busy reading other documents. Try again in 30 s."
    );
  });

  it("does not ask to try again in 0 s (stricter reading of AC17)", () => {
    expect(mapExtractionProblem(503, {}, new Headers({ "Retry-After": "0" })).error).not.toContain("in 0 s");
  });

  it("reads any other status as an unavailable API, without its text (AC18)", () => {
    expect(mapExtractionProblem(500, { detail: "Traceback: db locked" }, NO_HEADERS)).toEqual({
      error: "The API is unavailable. Your form and file were kept, try again in a moment.",
      kind: "unavailable",
      success: false
    });
  });
});

describe("mapExtractionUnreachable", () => {
  it("gives the generic error (AC18)", () => {
    expect(mapExtractionUnreachable().kind).toBe("unavailable");
  });
});
