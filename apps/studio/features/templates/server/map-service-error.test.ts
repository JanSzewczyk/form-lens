import { describe, expect, test as it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { templateFormSchema } from "~/features/templates/schemas/template-form-schema";

import { mapInvalidInput, mapProblem, mapUnreachable } from "./map-service-error";

describe("mapProblem", () => {
  it("reports a 404 as not found (edge case: deleted elsewhere)", () => {
    expect(mapProblem(404, { status: 404, title: "Template not found" })).toEqual({
      error: "Ten formularz już nie istnieje. Mógł zostać usunięty w innym miejscu.",
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
    expect(result.error).toBe("Interfejs API odrzucił formularz. Popraw zaznaczone pola.");
    expect(result.fieldErrors).toEqual({
      "fields.0.allowedValues": "Too long",
      "fields.0.description": "First wins",
      "fields.1.key": "String should match pattern",
      name: "String should have at most 100 characters"
    });
  });

  it("shows the detail of an invalid-template next to the Polish text (AC19)", () => {
    const result = mapProblem(422, {
      detail: "fields[2]: pattern does not compile",
      status: 422,
      title: "Invalid template",
      type: "urn:problem:formlens:invalid-template"
    });

    expect(result).toMatchObject({
      error: "Interfejs API odrzucił formularz: fields[2]: pattern does not compile",
      fieldErrors: {},
      kind: "validation"
    });
  });

  it("keeps the form-level message when there is no detail", () => {
    expect(mapProblem(422, undefined).error).toBe("Interfejs API odrzucił formularz");
    expect(mapProblem(400, undefined).error).toBe("Interfejs API nie przyjął formularza.");
  });

  it("explains a body that is too large", () => {
    expect(mapProblem(413, { status: 413, title: "Request body too large" })).toMatchObject({
      error: "Formularz jest zbyt duży, aby go zapisać.",
      kind: "validation"
    });
  });

  it("reports any other status as the API being unavailable, without its text", () => {
    expect(mapProblem(503, { detail: "database path /var/db", status: 503, title: "Service not ready" })).toEqual({
      error: "Interfejs API jest niedostępny. Wpisane dane zostały zachowane, spróbuj ponownie za chwilę.",
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
