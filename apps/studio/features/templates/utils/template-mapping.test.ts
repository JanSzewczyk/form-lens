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

describe("toTemplateBody and toFormValues, the edges", () => {
  it("keeps a bound of zero and a negative bound, which are not 'no bound'", () => {
    const body = toTemplateBody(
      templateFormValues({
        fields: [fieldValues({ key: "balance", maximum: "0", minimum: "-5", type: "integer" })]
      })
    );

    expect(body.fields[0]).toMatchObject({ maximum: 0, minimum: -5 });
  });

  it("shows a stored bound of zero as 0, not as an empty box (AC17)", () => {
    const values = toFormValues({
      description: "",
      fields: [{ maximum: 0, minimum: 0, name: "balance", type: "number" }],
      name: "Ledger"
    });

    expect(values.fields[0]).toMatchObject({ maximum: "0", minimum: "0" });
  });

  it("gives a field the API sent without optional properties an empty, usable row", () => {
    const values = toFormValues({ description: "", fields: [{ name: "flag", type: "boolean" }], name: "Flags" });

    expect(values.fields[0]).toEqual(fieldValues({ key: "flag", type: "boolean" }));
  });

  it("loses nothing on the way out and back in for every type (AC17, AC18)", () => {
    const values = templateFormValues({
      description: "All six types",
      fields: [
        fieldValues({ description: "Top right", key: "invoice_number", pattern: "^INV-[0-9]+$", required: true }),
        fieldValues({ key: "total", maximum: "10000", minimum: "0.5", type: "number" }),
        fieldValues({ key: "units", maximum: "9", minimum: "1", type: "integer" }),
        fieldValues({ key: "paid", type: "boolean" }),
        fieldValues({ key: "issued_on", type: "date" }),
        fieldValues({ allowedValues: "paid\nopen\nvoid", key: "status", type: "choice" })
      ]
    });

    expect(toFormValues({ description: "", ...toTemplateBody(values) })).toEqual(values);
  });

  it("sends a pattern with no spaces cut off the ends of it as typed by the user", () => {
    const body = toTemplateBody(templateFormValues({ fields: [fieldValues({ key: "code", pattern: " ^A B$ " })] }));

    // A space is a character of a regular expression; the stricter reading keeps it.
    expect(body.fields[0]?.pattern).toBe(" ^A B$ ");
  });
});

describe("buildResponsePreview, after the rows were changed (AC16)", () => {
  it("follows the order of the rows for every type", () => {
    const fields = [
      fieldValues({ key: "a", type: "boolean" }),
      fieldValues({ key: "b", type: "choice" }),
      fieldValues({ key: "c", type: "integer" }),
      fieldValues({ key: "d", type: "text" })
    ];

    expect(buildResponsePreview([fields[3], fields[0], fields[2], fields[1]] as typeof fields)).toBe(
      '{\n  "d": "text",\n  "a": "boolean",\n  "c": "integer",\n  "b": "choice"\n}'
    );
  });

  it("is valid JSON whose key order is the order of the rows", () => {
    const preview = buildResponsePreview([fieldValues({ key: "z" }), fieldValues({ key: "a", type: "date" })]);

    expect(Object.entries(JSON.parse(preview) as Record<string, string>)).toEqual([
      ["z", "text"],
      ["a", "date"]
    ]);
  });
});
