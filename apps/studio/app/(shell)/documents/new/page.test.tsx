import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { fieldSpecBuilder, templateResponseBuilder } from "~/features/templates/utils/template.builder";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/features/extractions/server/extraction-actions", () => ({ submitExtraction: vi.fn() }));
vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);
/** The real loader behind a spy, so a test can see that an id was never sent to the API. */
vi.mock("~/features/templates/server/load-template", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/features/templates/server/load-template")>();
  return { ...actual, loadTemplate: vi.fn(actual.loadTemplate) };
});
/** The runtime value asks for 50 MB, but the build allowed 25 MB: the page offers 25 MB (AC12). */
vi.hoisted(() => {
  vi.stubEnv("FORMLENS_MAX_UPLOAD_MB", "50");
  vi.stubEnv("FORMLENS_BUILD_MAX_UPLOAD_MB", "25");
});

import { loadTemplate } from "~/features/templates/server/load-template";

import NewDocumentPage, { metadata } from "./page";

const TEMPLATE_ID = "6f1c1b5e-0f0e-4b1e-9d36-3f0d8f9c2a10";
/** The API creates its ids with `uuid.uuid7()`. */
const UUID_V7 = "019a6f3e-8c2b-7d41-9a3e-5b2c1d0e4f6a";

async function renderPage(query: Record<string, string | Array<string>>) {
  const element = await NewDocumentPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) } as never);
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  resetLog();
  vi.mocked(loadTemplate).mockClear();
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

  it("shows the Upload step with the chosen form, its fields and the build-time size limit (AC5, AC6, AC12)", async () => {
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
    expect(html.replaceAll("<!-- -->", "")).toContain("max 25 MB");
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
    expect(loadTemplate).toHaveBeenCalledWith(TEMPLATE_ID);
  });

  it("throws to the error page when the API is down on the Upload step", async () => {
    server.use(http.get(apiUrl(`/v1/templates/${TEMPLATE_ID}`), () => HttpResponse.error()));

    await expect(renderPage({ template: TEMPLATE_ID })).rejects.toThrow("Failed to load the form");
  });
  it("lets the user page through every form, keeping the search (AC2, AC4)", async () => {
    const forms = templateResponseBuilder.many(13);
    const asked = servePagedForms(forms);

    const first = await renderPage({ q: "invoice" });
    const second = await renderPage({ page: "2", q: "invoice" });

    expect(asked).toEqual([
      { limit: "12", offset: "0", search: "invoice" },
      { limit: "12", offset: "12", search: "invoice" }
    ]);
    expect(first).toContain('href="/documents/new?q=invoice&amp;page=2"');
    expect(second).toContain('href="/documents/new?q=invoice"');
    const listed = [...templateLinks(first), ...templateLinks(second)];
    expect(listed).toEqual(forms.map((form) => form.id));
  });

  it.each([["abc"], ["0"], ["-3"]])("reads page %s as the first page", async (page) => {
    const asked = servePagedForms(templateResponseBuilder.many(3));

    await renderPage({ page });

    expect(asked[0]?.offset).toBe("0");
  });

  it("does not show a page past the last one as an empty list (stricter reading of AC4)", async () => {
    servePagedForms(templateResponseBuilder.many(13));

    const html = await renderPage({ page: "99" });

    expect(html).not.toContain("Page 99 of 2");
  });

  it.each([["not-a-uuid"], ["../extractions"], ["..%2Fextractions"], [`${TEMPLATE_ID}/../../extractions`]])(
    "says the form was not found for the id %s and never sends it to the API (AC8)",
    async (templateId) => {
      const html = await renderPage({ template: templateId });

      expect(html).toContain("Form not found");
      expect(html).toMatch(/<a[^>]*href="\/documents\/new"[^>]*>Choose form<\/a>/);
      expect(html).not.toContain("Start analysis");
      expect(loadTemplate).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["a UUIDv7 as the API creates it", UUID_V7],
    ["an upper-case UUID", UUID_V7.toUpperCase()]
  ])("loads the form for %s (AC5, AC8)", async (_case, templateId) => {
    const template = templateResponseBuilder.one({ overrides: { id: templateId, name: "VAT invoice" } });
    server.use(http.get(apiUrl(`/v1/templates/${templateId}`), () => HttpResponse.json(template)));

    const html = await renderPage({ template: templateId });

    expect(loadTemplate).toHaveBeenCalledWith(templateId);
    expect(html).toContain("Start analysis");
    expect(html).not.toContain("Form not found");
  });

  it("trims the spaces around a UUID before loading the form (AC8)", async () => {
    const template = templateResponseBuilder.one({ overrides: { id: TEMPLATE_ID, name: "VAT invoice" } });
    server.use(http.get(apiUrl(`/v1/templates/${TEMPLATE_ID}`), () => HttpResponse.json(template)));

    const html = await renderPage({ template: `  ${TEMPLATE_ID}\n` });

    expect(loadTemplate).toHaveBeenCalledWith(TEMPLATE_ID);
    expect(html).toContain("Start analysis");
  });

  it.each([[""], ["   "]])(
    "shows Choose form for the empty template %j and loads no form (AC1, AC8)",
    async (templateId) => {
      const forms = templateResponseBuilder.many(2);
      server.use(http.get(apiUrl("/v1/templates"), () => HttpResponse.json({ items: forms, total: forms.length })));

      const html = await renderPage({ template: templateId });

      expect(loadTemplate).not.toHaveBeenCalled();
      expect(html).not.toContain("Form not found");
      for (const form of forms) {
        expect(html).toContain(`href="/documents/new?template=${form.id}"`);
      }
    }
  );

  it("reads only the first of repeated template values: a UUID first loads the form (AC8)", async () => {
    const template = templateResponseBuilder.one({ overrides: { id: TEMPLATE_ID, name: "VAT invoice" } });
    server.use(http.get(apiUrl(`/v1/templates/${TEMPLATE_ID}`), () => HttpResponse.json(template)));

    const html = await renderPage({ template: [TEMPLATE_ID, "../extractions"] });

    expect(loadTemplate).toHaveBeenCalledTimes(1);
    expect(loadTemplate).toHaveBeenCalledWith(TEMPLATE_ID);
    expect(html).toContain("Start analysis");
  });

  it("reads only the first of repeated template values: a path first is never sent (AC8)", async () => {
    const html = await renderPage({ template: ["../extractions", TEMPLATE_ID] });

    expect(html).toContain("Form not found");
    expect(loadTemplate).not.toHaveBeenCalled();
  });

  it.each([
    [`${TEMPLATE_ID}?limit=1`],
    [`${TEMPLATE_ID}#x`],
    [`${TEMPLATE_ID}\u0000`],
    [`${TEMPLATE_ID} ${TEMPLATE_ID}`],
    [`{${TEMPLATE_ID}}`],
    [TEMPLATE_ID.replaceAll("-", "")],
    ["6f1c1b5e-0f0e-4b1e-9d36-3f0d8f9c2a1z"],
    [".."],
    ["%2e%2e%2fextractions"],
    ["․․/extractions"]
  ])("says the form was not found for the id %j and never sends it to the API (AC8)", async (templateId) => {
    const html = await renderPage({ template: templateId });

    expect(html).toContain("Form not found");
    expect(loadTemplate).not.toHaveBeenCalled();
  });
});

/** The API's list endpoint over `forms`, sliced by `offset` and `limit`; returns what each request asked for. */
function servePagedForms(forms: Array<ReturnType<typeof templateResponseBuilder.one>>) {
  const asked: Array<{ limit: string | null; offset: string | null; search: string | null }> = [];
  server.use(
    http.get(apiUrl("/v1/templates"), ({ request }) => {
      const params = new URL(request.url).searchParams;
      asked.push({ limit: params.get("limit"), offset: params.get("offset"), search: params.get("search") });
      const offset = Number(params.get("offset") ?? 0);
      const limit = Number(params.get("limit") ?? 12);
      return HttpResponse.json({ items: forms.slice(offset, offset + limit), total: forms.length });
    })
  );
  return asked;
}

function templateLinks(html: string): Array<string> {
  return [...html.matchAll(/href="\/documents\/new\?template=([^"]+)"/g)].map((match) => match[1] ?? "");
}
