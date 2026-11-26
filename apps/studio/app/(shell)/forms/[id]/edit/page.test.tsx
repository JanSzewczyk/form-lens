import * as React from "react";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { TemplateEditor } from "~/features/templates/components/template-editor";
import {
  fieldSpecBuilder,
  templateFormValuesBuilder,
  templateResponseBuilder
} from "~/features/templates/utils/template.builder";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

const actions = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  updateTemplate: vi.fn()
}));
const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("~/features/templates/server/template-actions", () => actions);
vi.mock("next/navigation", () => ({ notFound: navigation.notFound }));
vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import EditFormPage, { generateMetadata } from "~/app/(shell)/forms/[id]/edit/page";

const stored = templateResponseBuilder.one({
  overrides: {
    description: "Supplier invoices",
    fields: [
      fieldSpecBuilder.one({
        overrides: {
          allowed_values: null,
          description: "Top right",
          name: "invoice_number",
          pattern: "^INV-",
          required: true,
          type: "text"
        }
      })
    ],
    name: "VAT invoice",
    version: 3
  }
});

/** The API answers a read of one template. */
function apiHasTemplate(template = stored) {
  server.use(http.get(apiUrl("/v1/templates/:id"), () => HttpResponse.json(template)));
}

function params(id: string) {
  return { params: Promise.resolve({ id }) } as never;
}

/** Every element of a rendered tree, to find the editor the page composed. */
function findEditor(
  node: React.ReactNode
): React.ReactElement<React.ComponentProps<typeof TemplateEditor>> | undefined {
  if (!React.isValidElement(node)) {
    return Array.isArray(node) ? (node as Array<React.ReactNode>).map(findEditor).find(Boolean) : undefined;
  }
  if (node.type === TemplateEditor) {
    return node as React.ReactElement<React.ComponentProps<typeof TemplateEditor>>;
  }
  return findEditor((node.props as { children?: React.ReactNode }).children);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLog();
  navigation.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("the edit page (AC21, AC17, AC18, AC20)", () => {
  it("shows the not-found page for an id the API does not know (404)", async () => {
    server.use(http.get(apiUrl("/v1/templates/:id"), () => problem(404, { title: "Template not found" })));

    await expect(EditFormPage(params("11111111-1111-4111-8111-111111111111"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalledOnce();
  });

  it("shows the not-found page for an id that is not a template id (422)", async () => {
    server.use(http.get(apiUrl("/v1/templates/:id"), () => problem(422, { title: "Request validation failed" })));

    await expect(EditFormPage(params("not-an-id"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends a down API to the error page, not to the not-found page", async () => {
    server.use(http.get(apiUrl("/v1/templates/:id"), () => problem(503, { title: "Service not ready" })));

    await expect(EditFormPage(params("22222222-2222-4222-8222-222222222222"))).rejects.toThrow(/Failed to load/);
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it("sends an unreachable API to the error page, not to the not-found page", async () => {
    server.use(http.get(apiUrl("/v1/templates/:id"), () => HttpResponse.error()));

    await expect(EditFormPage(params("33333333-3333-4333-8333-333333333333"))).rejects.toThrow(/Failed to load/);
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it("fills the editor with every property of the stored template (AC17)", async () => {
    apiHasTemplate();

    const page = await EditFormPage(params("44444444-4444-4444-8444-444444444444"));
    const editor = findEditor(page);

    expect(editor?.props.mode).toBe("edit");
    expect(editor?.props.initialValues).toEqual(
      templateFormValuesBuilder.one({
        overrides: {
          description: "Supplier invoices",
          fields: [
            {
              allowedValues: "",
              description: "Top right",
              key: "invoice_number",
              maximum: "",
              minimum: "",
              pattern: "^INV-",
              required: true,
              type: "text"
            }
          ],
          name: "VAT invoice"
        }
      })
    );
  });

  it("binds Save and Delete to the template of the URL, not to another one", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    apiHasTemplate();
    const editor = findEditor(await EditFormPage(params(id)));
    const values = templateFormValuesBuilder.one();

    await editor?.props.onSubmitAction(values);
    expect(actions.updateTemplate).toHaveBeenCalledWith(id, values);

    if (editor?.props.mode === "edit") {
      await editor.props.onDeleteAction();
    }
    expect(actions.deleteTemplate).toHaveBeenCalledWith(id);
    expect(actions.createTemplate).not.toHaveBeenCalled();
  });

  it("titles the tab with the name of the form, and falls back when there is none", async () => {
    apiHasTemplate();
    await expect(generateMetadata(params("66666666-6666-4666-8666-666666666666"))).resolves.toEqual({
      title: "Edit VAT invoice"
    });

    server.use(http.get(apiUrl("/v1/templates/:id"), () => problem(404, { title: "x" })));
    await expect(generateMetadata(params("77777777-7777-4777-8777-777777777777"))).resolves.toEqual({
      title: "Edit form"
    });
    expect(navigation.notFound).not.toHaveBeenCalled();
  });
});
