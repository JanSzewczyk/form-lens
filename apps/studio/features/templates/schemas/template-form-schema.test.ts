import { describe, expect, test as it } from "vitest";

import { fieldValuesBuilder, templateFormValuesBuilder } from "~/features/templates/utils/template.builder";

import { parseAllowedValues, type TemplateFieldValues, templateFormSchema } from "./template-form-schema";

/** The messages by form path of the first issue at each path. */
function issuesByPath(values: unknown): Record<string, string> {
  const result = templateFormSchema.safeParse(values);
  if (result.success) {
    return {};
  }
  const byPath: Record<string, string> = {};
  for (const issue of result.error.issues) {
    byPath[issue.path.join(".")] ??= issue.message;
  }
  return byPath;
}

describe("templateFormSchema", () => {
  it("accepts the Invoice form with one text field (AC12)", () => {
    expect(templateFormSchema.safeParse(templateFormValuesBuilder.one()).success).toBe(true);
  });

  it("points at an empty name (AC13)", () => {
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { name: "   " } }))).toEqual({
      name: "Enter a name for the form"
    });
  });

  it("points at a form with no fields (AC13)", () => {
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { fields: [] } }))).toEqual({
      fields: "Add at least one field"
    });
  });

  it("points at a field with no key (AC13)", () => {
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { fields: [fieldValuesBuilder.one()] } }))).toEqual({
      "fields.0.key": "Enter a key for this field"
    });
  });

  it("refuses a key that breaks the API's pattern", () => {
    expect(
      issuesByPath(
        templateFormValuesBuilder.one({
          overrides: { fields: [fieldValuesBuilder.one({ overrides: { key: "Invoice No" } })] }
        })
      )
    ).toHaveProperty("fields.0.key");
  });

  it("puts the message of a duplicate key on the second field (AC14)", () => {
    const values = templateFormValuesBuilder.one({
      overrides: {
        fields: [
          fieldValuesBuilder.one({ overrides: { key: "total" } }),
          fieldValuesBuilder.one({ overrides: { key: "date" } }),
          fieldValuesBuilder.one({ overrides: { key: "total" } })
        ]
      }
    });

    expect(issuesByPath(values)).toEqual({ "fields.2.key": "This key is already used by another field" });
  });

  it("refuses a choice field with no allowed values (AC15)", () => {
    const values = templateFormValuesBuilder.one({
      overrides: {
        fields: [fieldValuesBuilder.one({ overrides: { allowedValues: " \n ", key: "status", type: "choice" } })]
      }
    });

    expect(issuesByPath(values)).toEqual({ "fields.0.allowedValues": "Add at least one allowed value" });
  });

  it("accepts a choice field with values", () => {
    const values = templateFormValuesBuilder.one({
      overrides: {
        fields: [
          fieldValuesBuilder.one({ overrides: { allowedValues: "open\nclosed", key: "status", type: "choice" } })
        ]
      }
    });

    expect(templateFormSchema.safeParse(values).success).toBe(true);
  });

  it("refuses allowed values on a field that is not a choice", () => {
    const values = templateFormValuesBuilder.one({
      overrides: { fields: [fieldValuesBuilder.one({ overrides: { allowedValues: "a", key: "status" } })] }
    });

    expect(issuesByPath(values)).toHaveProperty("fields.0.allowedValues");
  });

  it("refuses more than 50 allowed values, a value over 100 characters and repeated values", () => {
    const choice = (allowedValues: string) =>
      issuesByPath(
        templateFormValuesBuilder.one({
          overrides: {
            fields: [fieldValuesBuilder.one({ overrides: { allowedValues, key: "status", type: "choice" } })]
          }
        })
      );
    const many = Array.from({ length: 51 }, (_, index) => `v${index}`).join("\n");

    expect(choice(many)).toHaveProperty("fields.0.allowedValues");
    expect(choice("x".repeat(101))).toHaveProperty("fields.0.allowedValues");
    expect(choice("a\nb\na")).toHaveProperty("fields.0.allowedValues");
    expect(choice(Array.from({ length: 50 }, (_, index) => `v${index}`).join("\n"))).toEqual({});
    expect(choice("x".repeat(100))).toEqual({});
  });

  it("allows a range only on number and integer fields", () => {
    const withRange = (type: "number" | "integer" | "text" | "date") =>
      issuesByPath(
        templateFormValuesBuilder.one({
          overrides: {
            fields: [fieldValuesBuilder.one({ overrides: { key: "amount", maximum: "10", minimum: "1", type } })]
          }
        })
      );

    expect(withRange("number")).toEqual({});
    expect(withRange("integer")).toEqual({});
    expect(withRange("text")).toHaveProperty("fields.0.minimum");
    expect(withRange("date")).toHaveProperty("fields.0.maximum");
  });

  it("checks the bounds are numbers, whole for an integer, and in order", () => {
    const field = (overrides: Partial<TemplateFieldValues>) =>
      issuesByPath(
        templateFormValuesBuilder.one({
          overrides: {
            fields: [fieldValuesBuilder.one({ overrides: { key: "amount", type: "number", ...overrides } })]
          }
        })
      );

    expect(field({ minimum: "abc" })).toHaveProperty("fields.0.minimum");
    expect(field({ maximum: "5", minimum: "9" })).toHaveProperty("fields.0.minimum");
    expect(field({ maximum: "1.5", type: "integer" })).toHaveProperty("fields.0.maximum");
  });

  it("allows a pattern only on a text field", () => {
    const withPattern = (type: "text" | "number") =>
      issuesByPath(
        templateFormValuesBuilder.one({
          overrides: { fields: [fieldValuesBuilder.one({ overrides: { key: "code", pattern: "^A", type } })] }
        })
      );

    expect(withPattern("text")).toEqual({});
    expect(withPattern("number")).toHaveProperty("fields.0.pattern");
  });

  it("holds the limits of the API: name 100, description 300, 1 to 50 fields", () => {
    const fields = (count: number) =>
      Array.from({ length: count }, (_, index) => fieldValuesBuilder.one({ overrides: { key: `field_${index}` } }));

    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { name: "n".repeat(100) } }))).toEqual({});
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { name: "n".repeat(101) } }))).toHaveProperty(
      "name"
    );
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { description: "d".repeat(300) } }))).toEqual({});
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { description: "d".repeat(301) } }))).toHaveProperty(
      "description"
    );
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { fields: fields(50) } }))).toEqual({});
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { fields: fields(51) } }))).toHaveProperty("fields");
  });
});

describe("parseAllowedValues", () => {
  it("splits on lines, trims and drops blank lines", () => {
    expect(parseAllowedValues(" open \n\nclosed\n  ")).toEqual(["open", "closed"]);
  });
});

describe("templateFormSchema, the limits of the API at their edges", () => {
  const one = (overrides: Partial<TemplateFieldValues>) =>
    issuesByPath(
      templateFormValuesBuilder.one({
        overrides: { fields: [fieldValuesBuilder.one({ overrides: { key: "amount", ...overrides } })] }
      })
    );

  it("holds a field key to 64 characters", () => {
    expect(one({ key: `a${"b".repeat(63)}` })).toEqual({});
    expect(one({ key: `a${"b".repeat(64)}` })).toHaveProperty("fields.0.key");
  });

  it("refuses keys the API refuses: a leading digit or underscore, upper case, a dash, a space", () => {
    for (const key of ["1total", "_total", "Total", "to-tal", "to tal", "total "]) {
      expect(one({ key }), key).toHaveProperty("fields.0.key");
    }
  });

  it("holds a field description to 300 characters and a pattern to 200", () => {
    expect(one({ description: "d".repeat(300) })).toEqual({});
    expect(one({ description: "d".repeat(301) })).toHaveProperty("fields.0.description");
    expect(one({ pattern: "a".repeat(200) })).toEqual({});
    expect(one({ pattern: "a".repeat(201) })).toHaveProperty("fields.0.pattern");
  });

  it("accepts a name that is 100 characters once the spaces around it are cut", () => {
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { name: ` ${"n".repeat(100)} ` } }))).toEqual({});
  });

  it("counts characters as the API does, not UTF-16 units (stricter reading of the limits)", () => {
    // 60 emoji are 60 characters for the API (limit 100) and 120 UTF-16 units.
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { name: "😀".repeat(60) } }))).toEqual({});
    expect(issuesByPath(templateFormValuesBuilder.one({ overrides: { description: "😀".repeat(200) } }))).toEqual({});
  });

  it("accepts a range of one value, zero, negatives and exponents", () => {
    expect(one({ maximum: "5", minimum: "5", type: "number" })).toEqual({});
    expect(one({ maximum: "0", minimum: "-10", type: "integer" })).toEqual({});
    expect(one({ maximum: "1e3", minimum: "-1.5e2", type: "number" })).toEqual({});
    expect(one({ maximum: "2", type: "number" })).toEqual({});
  });

  it("refuses a bound that is not a finite number", () => {
    for (const minimum of ["abc", "1,5", "Infinity", "NaN", "1e999", "5 6"]) {
      expect(one({ minimum, type: "number" }), minimum).toHaveProperty("fields.0.minimum");
    }
  });

  it("refuses a fractional bound on an integer and a range on a choice, boolean or date", () => {
    expect(one({ minimum: "0.5", type: "integer" })).toHaveProperty("fields.0.minimum");
    for (const type of ["boolean", "date"] as const) {
      expect(one({ maximum: "1", type }), type).toHaveProperty("fields.0.maximum");
    }
    expect(one({ allowedValues: "a", minimum: "1", type: "choice" })).toHaveProperty("fields.0.minimum");
  });

  it("refuses a pattern on boolean, date, integer and choice fields, accepts one on text", () => {
    for (const type of ["boolean", "date", "integer"] as const) {
      expect(one({ pattern: "^A", type }), type).toHaveProperty("fields.0.pattern");
    }
    expect(one({ allowedValues: "a", pattern: "^A", type: "choice" })).toHaveProperty("fields.0.pattern");
    expect(one({ pattern: "^A", type: "text" })).toEqual({});
  });

  it("treats spaces around a repeated allowed value as the same value, and refuses lines that are only spaces as no value", () => {
    expect(one({ allowedValues: "a\n a ", type: "choice" })).toHaveProperty("fields.0.allowedValues");
    expect(one({ allowedValues: "  \n\t\n", type: "choice" })).toEqual({
      "fields.0.allowedValues": "Add at least one allowed value"
    });
  });

  it("reports every duplicate of a key after its first use, not the first use", () => {
    const values = templateFormValuesBuilder.one({
      overrides: {
        fields: [
          fieldValuesBuilder.one({ overrides: { key: "a" } }),
          fieldValuesBuilder.one({ overrides: { key: "a" } }),
          fieldValuesBuilder.one({ overrides: { key: "b" } }),
          fieldValuesBuilder.one({ overrides: { key: "a" } })
        ]
      }
    });

    expect(Object.keys(issuesByPath(values)).sort((a, b) => a.localeCompare(b))).toEqual([
      "fields.1.key",
      "fields.3.key"
    ]);
  });

  it("does not call two untyped keys a duplicate; each one asks for its own key (AC13)", () => {
    const values = templateFormValuesBuilder.one({
      overrides: { fields: [fieldValuesBuilder.one(), fieldValuesBuilder.one()] }
    });

    expect(issuesByPath(values)).toEqual({
      "fields.0.key": "Enter a key for this field",
      "fields.1.key": "Enter a key for this field"
    });
  });

  it("refuses a type the API does not know and a required flag that is not a boolean", () => {
    expect(
      templateFormSchema.safeParse(
        templateFormValuesBuilder.one({
          overrides: { fields: [fieldValuesBuilder.one({ overrides: { key: "a", type: "object" as never } })] }
        })
      ).success
    ).toBe(false);
    expect(
      templateFormSchema.safeParse(
        templateFormValuesBuilder.one({
          overrides: { fields: [fieldValuesBuilder.one({ overrides: { key: "a", required: 1 as never } })] }
        })
      ).success
    ).toBe(false);
  });
});

describe("templateFormSchema, bounds typed as the user would type them (stricter reading of AC13)", () => {
  function boundIssues(minimum: string, type: TemplateFieldValues["type"] = "number") {
    return issuesByPath(
      templateFormValuesBuilder.one({
        overrides: { fields: [fieldValuesBuilder.one({ overrides: { key: "total", minimum, type } })] }
      })
    );
  }

  it.each(["0x10", "0b11", "0o7"])(
    "refuses %s as a bound: JavaScript reads it as a number, the user did not type one",
    (minimum) => {
      expect(boundIssues(minimum)).toHaveProperty("fields.0.minimum");
    }
  );

  it.each(["12", " 12 ", "-3", "+3", "0.5", ".5", "1e3", "-0"])("accepts %s as a bound", (minimum) => {
    expect(boundIssues(minimum)).toEqual({});
  });
});
