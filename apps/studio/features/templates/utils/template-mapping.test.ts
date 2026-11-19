import type { TemplateResponse } from "@form-lens/api-client";
import { describe, expect, test as it } from "vitest";

import { fieldValues, templateFormValues } from "./template-fixtures";
import { buildResponsePreview, emptyTemplateFormValues, toFormValues, toTemplateBody } from "./template-mapping";

const stored: Pick<TemplateResponse, "description" | "fields" | "name"> = {
  description: "Supplier invoices",
  fields: [
    {
      allowed_values: null,
      description: "Number",
      maximum: null,
      minimum: null,
      name: "invoice_number",
      pattern: "^INV-",
      required: true,
      type: "text"
    },
    {
      allowed_values: null,
      description: "",
      maximum: 100,
      minimum: 0.5,
      name: "total",
      pattern: null,
      required: false,
      type: "number"
    },
    { allowed_values: ["paid", "open"], description: "", name: "status", type: "choice" }
  ],
  name: "Invoice"
};

describe("toTemplateBody", () => {
  it("maps the Invoice form with one text field to the API body (AC12)", () => {
    expect(toTemplateBody(templateFormValues())).toEqual({
      description: "",
      fields: [
        {
          allowed_values: null,
          description: "",
          maximum: null,
          minimum: null,
          name: "invoice_number",
          pattern: null,
          required: false,
          type: "text"
        }
      ],
      name: "Invoice"
    });
  });

  it("keeps the range of a number, the pattern of a text and the values of a choice", () => {
    const body = toTemplateBody(toFormValues(stored));

    expect(body.fields[0]).toMatchObject({ pattern: "^INV-", required: true });
    expect(body.fields[1]).toMatchObject({ maximum: 100, minimum: 0.5 });
    expect(body.fields[2]).toMatchObject({ allowed_values: ["paid", "open"] });
  });

  it("drops what the type does not take", () => {
    const body = toTemplateBody(
      templateFormValues({
        fields: [
          fieldValues({ allowedValues: "a", key: "flag", maximum: "3", minimum: "1", pattern: "x", type: "boolean" })
        ]
      })
    );

    expect(body.fields[0]).toMatchObject({ allowed_values: null, maximum: null, minimum: null, pattern: null });
  });
});

describe("toFormValues", () => {
  it("fills every property of an edited template (AC17)", () => {
    const values = toFormValues(stored);

    expect(values.name).toBe("Invoice");
    expect(values.description).toBe("Supplier invoices");
    expect(values.fields[0]).toMatchObject({ key: "invoice_number", pattern: "^INV-", required: true, type: "text" });
    expect(values.fields[1]).toMatchObject({ maximum: "100", minimum: "0.5", type: "number" });
    expect(values.fields[2]).toMatchObject({ allowedValues: "paid\nopen", description: "", required: false });
  });
});

describe("buildResponsePreview", () => {
  it("is an empty object while there are no fields", () => {
    expect(buildResponsePreview(emptyTemplateFormValues().fields)).toBe("{ }");
  });

  it("lists the keys in the order of the fields with their types (AC16)", () => {
    const fields = [fieldValues({ key: "total", type: "number" }), fieldValues({ key: "issued_on", type: "date" })];

    expect(buildResponsePreview(fields)).toBe('{\n  "total": "number",\n  "issued_on": "date"\n}');
    expect(buildResponsePreview([...fields].reverse())).toBe('{\n  "issued_on": "date",\n  "total": "number"\n}');
  });

  it("skips a field whose key is not typed yet", () => {
    expect(buildResponsePreview([fieldValues({ key: "" }), fieldValues({ key: "a", type: "boolean" })])).toBe(
      '{\n  "a": "boolean"\n}'
    );
  });
});
