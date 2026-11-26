import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { fieldSpecBuilder, templateResponseBuilder } from "~/features/templates/utils/template.builder";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/features/extractions/server/extraction-actions", () => ({ submitExtraction: vi.fn() }));
vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);
vi.hoisted(() => {
  vi.stubEnv("FORMLENS_MAX_UPLOAD_MB", "25");
});

import NewDocumentPage, { metadata } from "./page";

const TEMPLATE_ID = "6f1c1b5e-0f0e-4b1e-9d36-3f0d8f9c2a10";

async function renderPage(query: Record<string, string>) {
  const element = await NewDocumentPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) } as never);
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  resetLog();
});

describe("New document page", () => {
  it("shows Choose form with a card per form when no template is chosen (AC1)", async () => {
    const forms = templateResponseBuilder.many(2);
    server.use(http.get(apiUrl("/v1/templates"), () => HttpResponse.json({ items: forms, total: forms.length })));

    const html = await renderPage({});

    expect(metadata.title).toBe("New document");
    expect(html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]).toBe("New document");
    for (const form of forms) {
      expect(html).toContain(`href="/documents/new?template=${form.id}"`);
    }
    expect(html).toContain('aria-current="step"');
  });

  it("sends the search to the API and keeps it in the box (AC2)", async () => {
    const searched: Array<string | null> = [];
    server.use(
      http.get(apiUrl("/v1/templates"), ({ request }) => {
        searched.push(new URL(request.url).searchParams.get("search"));
        return HttpResponse.json({
          items: [templateResponseBuilder.one({ overrides: { name: "VAT invoice" } })],
          total: 1
        });
      })
    );

    const html = await renderPage({ q: "invoice" });

    expect(searched).toEqual(["invoice"]);
    expect(html).toContain("VAT invoice");
    expect(html).toContain('value="invoice"');
  });

  it("shows the Upload step with the chosen form and its fields (AC5, AC6)", async () => {
    const template = templateResponseBuilder.one({
      overrides: {
        fields: fieldSpecBuilder.many(8),
        id: TEMPLATE_ID,
        name: "VAT invoice"
      }
    });
    server.use(http.get(apiUrl(`/v1/templates/${TEMPLATE_ID}`), () => HttpResponse.json(template)));

    const html = await renderPage({ template: TEMPLATE_ID });

    expect(html).toContain("VAT invoice");
    expect(html).toContain("8 fields to find");
    expect(html).toContain("Start analysis");
    for (const field of template.fields) {
      expect(html).toContain(field.name);
    }
  });

  it("says the form was not found and links back to Choose form (AC8)", async () => {
    server.use(http.get(apiUrl(`/v1/templates/${TEMPLATE_ID}`), () => problem(404)));

    const html = await renderPage({ template: TEMPLATE_ID });

    expect(html).toContain("Form not found");
    expect(html).toMatch(/<a[^>]*href="\/documents\/new"[^>]*>Choose form<\/a>/);
    expect(html).not.toContain("Start analysis");
  });

  it("throws to the error page when the API is down on the Upload step", async () => {
    server.use(http.get(apiUrl(`/v1/templates/${TEMPLATE_ID}`), () => HttpResponse.error()));

    await expect(renderPage({ template: TEMPLATE_ID })).rejects.toThrow("Failed to load the form");
  });
});
