import { beforeEach, describe, expect, test as it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  replaceTemplate: vi.fn()
}));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn()
}));
const log = vi.hoisted(() => {
  const logger = { error: vi.fn(), warn: vi.fn(), withError: vi.fn(), withMetadata: vi.fn() };
  logger.withError.mockReturnValue(logger);
  logger.withMetadata.mockReturnValue(logger);
  return logger;
});

vi.mock("server-only", () => ({}));
vi.mock("~/lib/formlens-api", () => api);
vi.mock("next/navigation", () => ({ redirect: navigation.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: navigation.revalidatePath }));
vi.mock("~/lib/logger", () => ({ createLogger: () => log, default: log }));

import { fieldValues, templateFormValues } from "~/features/templates/utils/template-fixtures";

import { createTemplate, deleteTemplate, updateTemplate } from "./template-actions";

const TEMPLATE_ID = "6f1c1b5e-0f0e-4b1e-9d36-3f0d8f9c2a10";

beforeEach(() => {
  vi.clearAllMocks();
  log.withError.mockReturnValue(log);
  log.withMetadata.mockReturnValue(log);
  navigation.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("createTemplate", () => {
  it("stores the template, revalidates the list and redirects to /forms?created=1 (AC12)", async () => {
    api.createTemplate.mockResolvedValue({ data: {}, status: 201 });

    await expect(createTemplate(templateFormValues())).rejects.toThrow("NEXT_REDIRECT:/forms?created=1");

    expect(api.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [expect.objectContaining({ name: "invoice_number", type: "text" })],
        name: "Invoice"
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(navigation.revalidatePath).toHaveBeenCalledWith("/forms");
  });

  it("refuses an input that breaks the schema without calling the API (AC13)", async () => {
    const result = await createTemplate(templateFormValues({ fields: [], name: "" }));

    expect(result).toMatchObject({
      fieldErrors: { fields: "Add at least one field", name: "Enter a name for the form" },
      kind: "validation",
      success: false
    });
    expect(api.createTemplate).not.toHaveBeenCalled();
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("refuses duplicate keys and a choice without values on the server too (AC14, AC15)", async () => {
    const result = await createTemplate(
      templateFormValues({
        fields: [fieldValues({ key: "a" }), fieldValues({ key: "a" }), fieldValues({ key: "b", type: "choice" })]
      })
    );

    expect(result.fieldErrors).toMatchObject({
      "fields.1.key": "This key is already used by another field",
      "fields.2.allowedValues": "Add at least one allowed value"
    });
    expect(api.createTemplate).not.toHaveBeenCalled();
  });

  it("returns the API's message and field errors and does not redirect when the API rejects the save (AC19)", async () => {
    api.createTemplate.mockResolvedValue({
      data: {
        errors: [
          { loc: ["body", "fields", 0, "name"], msg: "String should match pattern", type: "string_pattern_mismatch" }
        ],
        status: 422,
        title: "Request validation failed"
      },
      status: 422
    });

    const result = await createTemplate(templateFormValues());

    expect(result).toEqual({
      error: "Interfejs API odrzucił formularz. Popraw zaznaczone pola.",
      fieldErrors: { "fields.0.key": "String should match pattern" },
      kind: "validation",
      success: false
    });
    expect(navigation.redirect).not.toHaveBeenCalled();
    expect(navigation.revalidatePath).not.toHaveBeenCalled();
    expect(log.withMetadata).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
  });

  it("answers an unreachable API with a message, logs the raw error and keeps the input", async () => {
    const failure = new TypeError("fetch failed: ECONNREFUSED 10.0.0.5:8000");
    api.createTemplate.mockRejectedValue(failure);

    const result = await createTemplate(templateFormValues());

    expect(result.kind).toBe("unavailable");
    expect(result.error).not.toContain("ECONNREFUSED");
    expect(log.withError).toHaveBeenCalledWith(failure);
    expect(navigation.redirect).not.toHaveBeenCalled();
  });
});

describe("updateTemplate", () => {
  it("replaces the template and redirects to /forms?saved=1 (AC18)", async () => {
    api.replaceTemplate.mockResolvedValue({ data: {}, status: 200 });

    await expect(updateTemplate(TEMPLATE_ID, templateFormValues())).rejects.toThrow("NEXT_REDIRECT:/forms?saved=1");

    expect(api.replaceTemplate).toHaveBeenCalledWith(
      TEMPLATE_ID,
      expect.objectContaining({ name: "Invoice" }),
      expect.anything()
    );
    expect(navigation.revalidatePath).toHaveBeenCalledWith("/forms");
  });

  it("reports a template deleted elsewhere as not found (edge case)", async () => {
    api.replaceTemplate.mockResolvedValue({ data: { status: 404, title: "Template not found" }, status: 404 });

    const result = await updateTemplate(TEMPLATE_ID, templateFormValues());

    expect(result).toMatchObject({ kind: "not-found", success: false });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("refuses an invalid input without calling the API", async () => {
    const result = await updateTemplate(TEMPLATE_ID, templateFormValues({ name: "" }));

    expect(result.kind).toBe("validation");
    expect(api.replaceTemplate).not.toHaveBeenCalled();
  });
});

describe("deleteTemplate", () => {
  it("removes the template and redirects to /forms?deleted=1 (AC20)", async () => {
    api.deleteTemplate.mockResolvedValue({ data: undefined, status: 204 });

    await expect(deleteTemplate(TEMPLATE_ID)).rejects.toThrow("NEXT_REDIRECT:/forms?deleted=1");

    expect(api.deleteTemplate).toHaveBeenCalledWith(TEMPLATE_ID, expect.anything());
    expect(navigation.revalidatePath).toHaveBeenCalledWith("/forms");
  });

  it("reports a template deleted elsewhere as not found (edge case)", async () => {
    api.deleteTemplate.mockResolvedValue({ data: { status: 404, title: "Template not found" }, status: 404 });

    await expect(deleteTemplate(TEMPLATE_ID)).resolves.toMatchObject({ kind: "not-found", success: false });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });
});

describe("updateTemplate when the API rejects the save (AC19)", () => {
  it("returns the API's field messages, keeps the user on the form and does not revalidate or redirect", async () => {
    api.replaceTemplate.mockResolvedValue({
      data: {
        errors: [
          { loc: ["body", "name"], msg: "String should have at most 100 characters", type: "string_too_long" },
          { loc: ["body", "fields", 0, "pattern"], msg: "String should have at least 1 character", type: "x" }
        ],
        status: 422,
        title: "Request validation failed",
        type: "urn:problem:formlens:validation-error"
      },
      status: 422
    });

    const result = await updateTemplate(TEMPLATE_ID, templateFormValues());

    expect(result).toMatchObject({
      fieldErrors: {
        "fields.0.pattern": "String should have at least 1 character",
        name: "String should have at most 100 characters"
      },
      kind: "validation",
      success: false
    });
    expect(navigation.redirect).not.toHaveBeenCalled();
    expect(navigation.revalidatePath).not.toHaveBeenCalled();
  });

  it("shows the detail of an invalid-template answer next to the Polish text", async () => {
    api.replaceTemplate.mockResolvedValue({
      data: {
        detail: "Field total: allowed_values repeats a value",
        status: 422,
        title: "Invalid template",
        type: "urn:problem:formlens:invalid-template"
      },
      status: 422
    });

    const result = await updateTemplate(TEMPLATE_ID, templateFormValues());

    expect(result.error).toContain("Field total: allowed_values repeats a value");
    expect(result.kind).toBe("validation");
  });
});

describe("answers of the API that are not a field problem", () => {
  const SECRET = "postgres://admin:hunter2@10.0.0.5/formlens";

  it("keeps the raw text of a 5xx out of the message and logs it with the status", async () => {
    api.replaceTemplate.mockResolvedValue({
      data: { detail: SECRET, status: 500, title: "Internal Server Error" },
      status: 500
    });

    const result = await updateTemplate(TEMPLATE_ID, templateFormValues());

    expect(result.kind).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(log.withMetadata).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("does not throw on an answer that is not a problem document (an HTML error page of a proxy)", async () => {
    api.createTemplate.mockResolvedValue({ data: "<html>502 Bad Gateway</html>", status: 502 });

    const result = await createTemplate(templateFormValues());

    expect(result.kind).toBe("unavailable");
    expect(result.error).not.toContain("<html>");
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("reports a 400 as a refusal of the form, with the detail", async () => {
    api.createTemplate.mockResolvedValue({
      data: { detail: "The request body could not be read as text.", status: 400, title: "Bad Request" },
      status: 400
    });

    const result = await createTemplate(templateFormValues());

    expect(result.kind).toBe("validation");
    expect(result.error).toContain("The request body could not be read as text.");
  });

  it("reports a body that is too large as a refusal of the form", async () => {
    api.createTemplate.mockResolvedValue({ data: { status: 413, title: "Request body too large" }, status: 413 });

    await expect(createTemplate(templateFormValues())).resolves.toMatchObject({ kind: "validation" });
  });

  it("reports a timeout as unavailable and logs the raw error", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    api.replaceTemplate.mockRejectedValue(timeout);

    const result = await updateTemplate(TEMPLATE_ID, templateFormValues());

    expect(result.kind).toBe("unavailable");
    expect(result.error).not.toContain("timed out");
    expect(log.withError).toHaveBeenCalledWith(timeout);
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("does not redirect or revalidate when the API fails on a delete", async () => {
    api.deleteTemplate.mockResolvedValue({ data: { status: 500, title: "Internal Server Error" }, status: 500 });

    await expect(deleteTemplate(TEMPLATE_ID)).resolves.toMatchObject({ kind: "unavailable", success: false });
    expect(navigation.redirect).not.toHaveBeenCalled();
    expect(navigation.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not redirect when the API cannot be reached on a delete", async () => {
    api.deleteTemplate.mockRejectedValue(new TypeError("fetch failed"));

    await expect(deleteTemplate(TEMPLATE_ID)).resolves.toMatchObject({ kind: "unavailable", success: false });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("tells the user a template deleted elsewhere is gone, without revalidating", async () => {
    api.replaceTemplate.mockResolvedValue({ data: { status: 404, title: "Template not found" }, status: 404 });

    await updateTemplate(TEMPLATE_ID, templateFormValues());

    expect(navigation.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("the server checks the input again, whatever the form did (AC13, AC14, AC15)", () => {
  const crafted: Array<[string, unknown]> = [
    ["null", null],
    ["fields that is not a list", { description: "", fields: "x", name: "Invoice" }],
    [
      "a field type the API does not know",
      templateFormValues({ fields: [fieldValues({ key: "a", type: "object" as never })] })
    ],
    [
      "a required flag that is not a boolean",
      templateFormValues({ fields: [fieldValues({ key: "a", required: "yes" as never })] })
    ],
    ["a name over 100 characters", templateFormValues({ name: "n".repeat(101) })],
    ["a description over 300 characters", templateFormValues({ description: "d".repeat(301) })],
    [
      "51 fields",
      templateFormValues({ fields: Array.from({ length: 51 }, (_, index) => fieldValues({ key: `f${index}` })) })
    ],
    ["a key that is not a JSON-safe name", templateFormValues({ fields: [fieldValues({ key: "__proto__" })] })],
    ["a range on a text field", templateFormValues({ fields: [fieldValues({ key: "a", minimum: "1" })] })],
    [
      "a pattern on a number field",
      templateFormValues({ fields: [fieldValues({ key: "a", pattern: "^A", type: "number" })] })
    ]
  ];

  it.each(crafted)("refuses %s on create without calling the API or throwing", async (_name, input) => {
    const result = await createTemplate(input as never);

    expect(result).toMatchObject({ kind: "validation", success: false });
    expect(api.createTemplate).not.toHaveBeenCalled();
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it.each(crafted)("refuses %s on update without calling the API or throwing", async (_name, input) => {
    const result = await updateTemplate(TEMPLATE_ID, input as never);

    expect(result).toMatchObject({ kind: "validation", success: false });
    expect(api.replaceTemplate).not.toHaveBeenCalled();
  });

  it("sends the name without the spaces around it, the same value the schema accepted", async () => {
    api.createTemplate.mockResolvedValue({ data: {}, status: 201 });

    await expect(createTemplate(templateFormValues({ name: "  Invoice  " }))).rejects.toThrow("NEXT_REDIRECT");

    expect(api.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: "Invoice" }), expect.anything());
  });

  it("sends a choice field's values one per entry, trimmed, and nothing for min, max or pattern", async () => {
    api.createTemplate.mockResolvedValue({ data: {}, status: 201 });

    await expect(
      createTemplate(
        templateFormValues({
          fields: [fieldValues({ allowedValues: " paid \n\nopen\n", key: "status", required: true, type: "choice" })]
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(api.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [
          {
            allowed_values: ["paid", "open"],
            description: "",
            maximum: null,
            minimum: null,
            name: "status",
            pattern: null,
            required: true,
            type: "choice"
          }
        ]
      }),
      expect.anything()
    );
  });
});
