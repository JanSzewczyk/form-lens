import { describe, expect, test as it } from "vitest";

import { templateFormSchema } from "~/features/templates/schemas/template-form-schema";

import { mapInvalidInput, mapProblem, mapUnreachable } from "./map-service-error";

describe("mapProblem", () => {
  it("reports a 404 as not found (edge case: deleted elsewhere)", () => {
    expect(mapProblem(404, { status: 404, title: "Template not found" })).toEqual({
      error: "This form no longer exists. It may have been deleted elsewhere.",
      fieldErrors: {},
      kind: "not-found",
      success: false
    });
  });

  it("maps the issues of a validation-error to form paths, with the API's own messages (AC19)", () => {
    const result = mapProblem(422, {
      errors: [
        { loc: ["body", "name"], msg: "String should have at most 100 characters", type: "string_too_long" },
        { loc: ["body", "fields", 1, "name"], msg: "String should match pattern", type: "string_pattern_mismatch" },
        { loc: ["body", "fields", 0, "allowed_values"], msg: "Too long", type: "too_long" },
        { loc: ["body", "fields", 0, "description"], msg: "First wins", type: "x" },
        { loc: ["body", "fields", 0, "description"], msg: "Second is ignored", type: "x" },
        { loc: ["query", "limit"], msg: "not a form input", type: "x" }
      ],
      status: 422,
      title: "Request validation failed",
      type: "urn:problem:formlens:validation-error"
    });

    expect(result.kind).toBe("validation");
    expect(result.error).toBe("The API rejected the form. Fix the marked fields.");
    expect(result.fieldErrors).toEqual({
      "fields.0.allowedValues": "Too long",
      "fields.0.description": "First wins",
      "fields.1.key": "String should match pattern",
      name: "String should have at most 100 characters"
    });
  });

  it("shows the detail of an invalid-template next to the English text (AC19)", () => {
    const result = mapProblem(422, {
      detail: "fields[2]: pattern does not compile",
      status: 422,
      title: "Invalid template",
      type: "urn:problem:formlens:invalid-template"
    });

    expect(result).toMatchObject({
      error: "The API rejected the form: fields[2]: pattern does not compile",
      fieldErrors: {},
      kind: "validation"
    });
  });

  it("keeps the form-level message when there is no detail", () => {
    expect(mapProblem(422, undefined).error).toBe("The API rejected the form");
    expect(mapProblem(400, undefined).error).toBe("The API did not accept the form.");
  });

  it("explains a body that is too large", () => {
    expect(mapProblem(413, { status: 413, title: "Request body too large" })).toMatchObject({
      error: "The form is too large to save.",
      kind: "validation"
    });
  });

  it("reports any other status as the API being unavailable, without its text", () => {
    expect(mapProblem(503, { detail: "database path /var/db", status: 503, title: "Service not ready" })).toEqual({
      error: "The API is unavailable. Your input was kept, try again in a moment.",
      fieldErrors: {},
      kind: "unavailable",
      success: false
    });
  });
});

describe("mapUnreachable", () => {
  it("reports the API as unavailable", () => {
    expect(mapUnreachable().kind).toBe("unavailable");
  });
});

describe("mapInvalidInput", () => {
  it("keeps the first message of each form path of the schema", () => {
    const parsed = templateFormSchema.safeParse({ description: "", fields: [], name: "" });
    if (parsed.success) {
      throw new Error("The input should be invalid");
    }

    expect(mapInvalidInput(parsed.error)).toMatchObject({
      fieldErrors: { fields: "Add at least one field", name: "Enter a name for the form" },
      kind: "validation"
    });
  });
});

describe("mapProblem, the edges of a validation-error (AC19)", () => {
  it("maps the position of a rejected allowed value to the field that shows it", () => {
    const result = mapProblem(422, {
      errors: [
        { loc: ["body", "fields", 0, "allowed_values", 2], msg: "String should have at least 1 character", type: "x" }
      ],
      status: 422,
      title: "Request validation failed"
    });

    // The row renders `fields.0.allowedValues`; a path that goes deeper has no place on the screen.
    expect(result.fieldErrors).toEqual({ "fields.0.allowedValues": "String should have at least 1 character" });
  });

  it("maps a problem of the whole field list to `fields`, where the editor shows it", () => {
    const result = mapProblem(422, {
      errors: [{ loc: ["body", "fields"], msg: "List should have at least 1 item after validation, not 0", type: "x" }],
      status: 422,
      title: "Request validation failed"
    });

    expect(result.fieldErrors).toEqual({ fields: "List should have at least 1 item after validation, not 0" });
  });

  it("does not lose the API's message when no issue names a form input (stricter reading of AC19)", () => {
    const result = mapProblem(422, {
      errors: [{ loc: ["body"], msg: "Input should be a valid dictionary", type: "dict_type" }],
      status: 422,
      title: "Request validation failed"
    });

    expect(JSON.stringify(result)).toContain("Input should be a valid dictionary");
  });

  it("keeps the user-facing text English and free of the API's internals for a 5xx", () => {
    const result = mapProblem(500, { detail: "Traceback (most recent call last)", status: 500, title: "x" });

    expect(result.error).toMatch(/The API/);
    expect(JSON.stringify(result)).not.toContain("Traceback");
  });
});
