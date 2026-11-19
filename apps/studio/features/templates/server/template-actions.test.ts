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
