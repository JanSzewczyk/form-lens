import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { fieldValuesBuilder, templateFormValuesBuilder } from "~/features/templates/utils/template.builder";
import { log, resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, server } from "~/tests/unit/msw/server";

const next = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  setToastCookie: vi.fn()
}));

vi.mock("next/navigation", () => ({ redirect: next.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: next.revalidatePath }));
vi.mock("~/lib/toast/server/toast.cookie", () => ({ setToastCookie: next.setToastCookie }));
vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { createTemplate, deleteTemplate, updateTemplate } from "./template-actions";

type Method = "delete" | "post" | "put";

/** The answer the API gives: nothing, a text (an HTML error page), or a JSON document. */
function answer(status: number, body?: unknown) {
  if (body === undefined) {
    return new HttpResponse(null, { status });
  }
  if (typeof body === "string") {
    return new HttpResponse(body, { headers: { "content-type": "text/html" }, status });
  }
  return HttpResponse.json(body as Record<string, unknown>, { status });
}

/** Makes the API answer a write and returns the bodies it received, so a test can see what was sent. */
function apiAnswers(method: Method, path: string, status: number, body?: unknown): Array<unknown> {
  const received: Array<unknown> = [];
  server.use(
    http[method](apiUrl(path), async ({ request }) => {
      received.push(method === "delete" ? null : await request.json());
      return answer(status, body);
    })
  );
  return received;
}

function apiIsUnreachable(method: Method, path: string) {
  server.use(http[method](apiUrl(path), () => HttpResponse.error()));
}

const LIST = "/v1/templates";
const ITEM = (id: string) => `/v1/templates/${id}`;

const TEMPLATE_ID = "6f1c1b5e-0f0e-4b1e-9d36-3f0d8f9c2a10";
const fields = fieldValuesBuilder;
const form = templateFormValuesBuilder;

beforeEach(() => {
  vi.clearAllMocks();
  resetLog();
  next.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("createTemplate", () => {
  it("stores the template, revalidates the list, leaves the toast and redirects to /forms (AC12)", async () => {
    const received = apiAnswers("post", LIST, 201, {});

    await expect(createTemplate(form.one())).rejects.toThrow("NEXT_REDIRECT:/forms");

    expect(received).toEqual([
      expect.objectContaining({
        fields: [expect.objectContaining({ name: "invoice_number", type: "text" })],
        name: "Invoice"
      })
    ]);
    expect(next.revalidatePath).toHaveBeenCalledWith("/forms");
    expect(next.setToastCookie).toHaveBeenCalledWith("Form created");
    expect(next.setToastCookie.mock.invocationCallOrder[0]).toBeLessThan(
      next.redirect.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("gives the API request a timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    apiAnswers("post", LIST, 201, {});

    await expect(createTemplate(form.one())).rejects.toThrow("NEXT_REDIRECT");

    expect(timeout).toHaveBeenCalledWith(10_000);
  });

  it("refuses an input that breaks the schema without calling the API or leaving a toast (AC13)", async () => {
    const result = await createTemplate(form.one({ overrides: { fields: [], name: "" } }));

    expect(result).toMatchObject({
      fieldErrors: { fields: "Add at least one field", name: "Enter a name for the form" },
      kind: "validation",
      success: false
    });
    expect(next.redirect).not.toHaveBeenCalled();
    expect(next.setToastCookie).not.toHaveBeenCalled();
  });

  it("refuses duplicate keys and a choice without values on the server too (AC14, AC15)", async () => {
    const result = await createTemplate(
      form.one({
        overrides: {
          fields: [
            fields.one({ overrides: { key: "a" } }),
            fields.one({ overrides: { key: "a" } }),
            fields.one({ overrides: { key: "b", type: "choice" } })
          ]
        }
      })
    );

    expect(result.fieldErrors).toMatchObject({
      "fields.1.key": "This key is already used by another field",
      "fields.2.allowedValues": "Add at least one allowed value"
    });
  });

  it("returns the API's message and field errors and does not redirect when the API rejects the save (AC19)", async () => {
    apiAnswers("post", LIST, 422, {
      errors: [
        { loc: ["body", "fields", 0, "name"], msg: "String should match pattern", type: "string_pattern_mismatch" }
      ],
      status: 422,
      title: "Request validation failed"
    });

    const result = await createTemplate(form.one());

    expect(result).toEqual({
      error: "The API rejected the form. Fix the marked fields.",
      fieldErrors: { "fields.0.key": "String should match pattern" },
      kind: "validation",
      success: false
    });
    expect(next.redirect).not.toHaveBeenCalled();
    expect(next.revalidatePath).not.toHaveBeenCalled();
    expect(next.setToastCookie).not.toHaveBeenCalled();
    expect(log.withMetadata).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
  });

  it("answers an unreachable API with a message, logs the raw error and keeps the input", async () => {
    apiIsUnreachable("post", LIST);

    const result = await createTemplate(form.one());

    expect(result.kind).toBe("unavailable");
    expect(result.error).not.toContain("fetch");
    expect(log.withError).toHaveBeenCalledWith(expect.any(TypeError));
    expect(next.redirect).not.toHaveBeenCalled();
  });
});

describe("updateTemplate", () => {
  it("replaces the template, leaves the toast and redirects to /forms (AC18)", async () => {
    const received = apiAnswers("put", ITEM(TEMPLATE_ID), 200, {});

    await expect(updateTemplate(TEMPLATE_ID, form.one())).rejects.toThrow("NEXT_REDIRECT:/forms");

    expect(received).toEqual([expect.objectContaining({ name: "Invoice" })]);
    expect(next.revalidatePath).toHaveBeenCalledWith("/forms");
    expect(next.setToastCookie).toHaveBeenCalledWith("Form saved");
  });

  it("reports a template deleted elsewhere as not found (edge case)", async () => {
    apiAnswers("put", ITEM(TEMPLATE_ID), 404, { status: 404, title: "Template not found" });

    const result = await updateTemplate(TEMPLATE_ID, form.one());

    expect(result).toMatchObject({ kind: "not-found", success: false });
    expect(next.redirect).not.toHaveBeenCalled();
    expect(next.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an invalid input without calling the API", async () => {
    const result = await updateTemplate(TEMPLATE_ID, form.one({ overrides: { name: "" } }));

    expect(result.kind).toBe("validation");
  });
});

describe("deleteTemplate", () => {
  it("removes the template, leaves the toast and redirects to /forms (AC20)", async () => {
    const received = apiAnswers("delete", ITEM(TEMPLATE_ID), 204);

    await expect(deleteTemplate(TEMPLATE_ID)).rejects.toThrow("NEXT_REDIRECT:/forms");

    expect(received).toHaveLength(1);
    expect(next.revalidatePath).toHaveBeenCalledWith("/forms");
    expect(next.setToastCookie).toHaveBeenCalledWith("Form deleted");
  });

  it("reports a template deleted elsewhere as not found (edge case)", async () => {
    apiAnswers("delete", ITEM(TEMPLATE_ID), 404, { status: 404, title: "Template not found" });

    await expect(deleteTemplate(TEMPLATE_ID)).resolves.toMatchObject({ kind: "not-found", success: false });
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it("does not redirect or revalidate when the API fails on a delete", async () => {
    apiAnswers("delete", ITEM(TEMPLATE_ID), 500, { status: 500, title: "Internal Server Error" });

    await expect(deleteTemplate(TEMPLATE_ID)).resolves.toMatchObject({ kind: "unavailable", success: false });
    expect(next.redirect).not.toHaveBeenCalled();
    expect(next.revalidatePath).not.toHaveBeenCalled();
    expect(next.setToastCookie).not.toHaveBeenCalled();
  });

  it("does not redirect when the API cannot be reached on a delete", async () => {
    apiIsUnreachable("delete", ITEM(TEMPLATE_ID));

    await expect(deleteTemplate(TEMPLATE_ID)).resolves.toMatchObject({ kind: "unavailable", success: false });
    expect(next.redirect).not.toHaveBeenCalled();
  });
});

describe("updateTemplate when the API rejects the save (AC19)", () => {
  it("returns the API's field messages, keeps the user on the form and does not revalidate or redirect", async () => {
    apiAnswers("put", ITEM(TEMPLATE_ID), 422, {
      errors: [
        { loc: ["body", "name"], msg: "String should have at most 100 characters", type: "string_too_long" },
        { loc: ["body", "fields", 0, "pattern"], msg: "String should have at least 1 character", type: "x" }
      ],
      status: 422,
      title: "Request validation failed",
      type: "urn:problem:formlens:validation-error"
    });

    const result = await updateTemplate(TEMPLATE_ID, form.one());

    expect(result).toMatchObject({
      fieldErrors: {
        "fields.0.pattern": "String should have at least 1 character",
        name: "String should have at most 100 characters"
      },
      kind: "validation",
      success: false
    });
    expect(next.redirect).not.toHaveBeenCalled();
    expect(next.revalidatePath).not.toHaveBeenCalled();
  });

  it("shows the detail of an invalid-template answer next to the English text", async () => {
    apiAnswers("put", ITEM(TEMPLATE_ID), 422, {
      detail: "Field total: allowed_values repeats a value",
      status: 422,
      title: "Invalid template",
      type: "urn:problem:formlens:invalid-template"
    });

    const result = await updateTemplate(TEMPLATE_ID, form.one());

    expect(result.error).toContain("Field total: allowed_values repeats a value");
    expect(result.kind).toBe("validation");
  });
});

describe("answers of the API that are not a field problem", () => {
  const SECRET = "postgres://admin:hunter2@10.0.0.5/formlens";

  it("keeps the raw text of a 5xx out of the message and logs it with the status", async () => {
    apiAnswers("put", ITEM(TEMPLATE_ID), 500, { detail: SECRET, status: 500, title: "Internal Server Error" });

    const result = await updateTemplate(TEMPLATE_ID, form.one());

    expect(result.kind).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(log.withMetadata).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it("does not throw on an answer that is not a problem document (an HTML error page of a proxy)", async () => {
    apiAnswers("post", LIST, 502, "<html>502 Bad Gateway</html>");

    const result = await createTemplate(form.one());

    expect(result.kind).toBe("unavailable");
    expect(result.error).not.toContain("<html>");
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it("reports a 400 as a refusal of the form, with the detail", async () => {
    apiAnswers("post", LIST, 400, {
      detail: "The request body could not be read as text.",
      status: 400,
      title: "Bad Request"
    });

    const result = await createTemplate(form.one());

    expect(result.kind).toBe("validation");
    expect(result.error).toContain("The request body could not be read as text.");
  });

  it("reports a body that is too large as a refusal of the form", async () => {
    apiAnswers("post", LIST, 413, { status: 413, title: "Request body too large" });

    await expect(createTemplate(form.one())).resolves.toMatchObject({ kind: "validation" });
  });

  it("reports a timeout as unavailable and logs the raw error", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(timeout));
    apiAnswers("put", ITEM(TEMPLATE_ID), 200, {});

    const result = await updateTemplate(TEMPLATE_ID, form.one());

    expect(result.kind).toBe("unavailable");
    expect(result.error).not.toContain("timed out");
    expect(log.withError).toHaveBeenCalledWith(timeout);
    expect(next.redirect).not.toHaveBeenCalled();
  });
});

describe("the server checks the input again, whatever the form did (AC13, AC14, AC15)", () => {
  const crafted: Array<[string, unknown]> = [
    ["null", null],
    ["fields that is not a list", { description: "", fields: "x", name: "Invoice" }],
    [
      "a field type the API does not know",
      form.one({ overrides: { fields: [fields.one({ overrides: { key: "a", type: "object" as never } })] } })
    ],
    [
      "a required flag that is not a boolean",
      form.one({ overrides: { fields: [fields.one({ overrides: { key: "a", required: "yes" as never } })] } })
    ],
    ["a name over 100 characters", form.one({ overrides: { name: "n".repeat(101) } })],
    ["a description over 300 characters", form.one({ overrides: { description: "d".repeat(301) } })],
    [
      "51 fields",
      form.one({
        overrides: { fields: fields.many(51).map((field, index) => ({ ...field, key: `f${index}` })) }
      })
    ],
    [
      "a key that is not a JSON-safe name",
      form.one({ overrides: { fields: [fields.one({ overrides: { key: "__proto__" } })] } })
    ],
    [
      "a range on a text field",
      form.one({ overrides: { fields: [fields.one({ overrides: { key: "a", minimum: "1" } })] } })
    ],
    [
      "a pattern on a number field",
      form.one({ overrides: { fields: [fields.one({ overrides: { key: "a", pattern: "^A", type: "number" } })] } })
    ]
  ];

  it.each(crafted)("refuses %s on create without calling the API or throwing", async (_name, input) => {
    const result = await createTemplate(input as never);

    expect(result).toMatchObject({ kind: "validation", success: false });
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it.each(crafted)("refuses %s on update without calling the API or throwing", async (_name, input) => {
    const result = await updateTemplate(TEMPLATE_ID, input as never);

    expect(result).toMatchObject({ kind: "validation", success: false });
  });

  it("sends the name without the spaces around it, the same value the schema accepted", async () => {
    const received = apiAnswers("post", LIST, 201, {});

    await expect(createTemplate(form.one({ overrides: { name: "  Invoice  " } }))).rejects.toThrow("NEXT_REDIRECT");

    expect(received).toEqual([expect.objectContaining({ name: "Invoice" })]);
  });

  it("sends a choice field's values one per entry, trimmed, and nothing for min, max or pattern", async () => {
    const received = apiAnswers("post", LIST, 201, {});

    await expect(
      createTemplate(
        form.one({
          overrides: {
            fields: [
              fields.one({
                overrides: { allowedValues: " paid \n\nopen\n", key: "status", required: true, type: "choice" }
              })
            ]
          }
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(received).toEqual([
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
      })
    ]);
  });
});

describe.each([
  ["a malformed id", "not-a-uuid"],
  ["a path traversal", "../../health/ready"],
  ["an encoded traversal", "%2e%2e/health"],
  ["an empty id", ""]
])("the template id of the update and delete actions, %s", (_name, templateId) => {
  it("refuses an update as not found without calling the API or redirecting", async () => {
    const result = await updateTemplate(templateId, form.one());

    expect(result).toMatchObject({ kind: "not-found", success: false });
    expect(next.redirect).not.toHaveBeenCalled();
    expect(next.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a delete as not found without calling the API or redirecting", async () => {
    const result = await deleteTemplate(templateId);

    expect(result).toMatchObject({ kind: "not-found", success: false });
    expect(next.redirect).not.toHaveBeenCalled();
    expect(next.revalidatePath).not.toHaveBeenCalled();
  });
});
