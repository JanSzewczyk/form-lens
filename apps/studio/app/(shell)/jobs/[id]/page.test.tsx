import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { ExtractionViewStatus } from "~/features/extractions/schemas/extraction";
import { extractionResponseBuilder } from "~/features/extractions/utils/extraction.builder";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("next/navigation", () => ({ notFound: navigation.notFound }));
vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import JobNotFound from "~/app/(shell)/jobs/[id]/not-found";
import JobPage, { generateMetadata } from "~/app/(shell)/jobs/[id]/page";

function params(id: string) {
  return { params: Promise.resolve({ id }) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLog();
  navigation.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("the job status page", () => {
  it("renders the current status and file · form from the server on open or reload (AC27, AC39)", async () => {
    const extraction = extractionResponseBuilder.one({
      overrides: {
        fields: [{ name: "invoice_number", required: true, type: "text" }],
        filename: "invoice_118_2026.pdf",
        status: ExtractionViewStatus.running,
        template_name: "VAT invoice"
      }
    });
    server.use(http.get(apiUrl(`/v1/extractions/${extraction.id}`), () => HttpResponse.json(extraction)));

    const html = renderToStaticMarkup(await JobPage(params(extraction.id)));

    expect(html).toContain("invoice_118_2026.pdf · VAT invoice");
    expect(html).toContain("Reading document");
    expect(html).toContain("Polling job status every 3 seconds");
    expect(html).toContain(extraction.id);
  });

  it("shows the not-found page for an unknown or expired extraction (AC28)", async () => {
    server.use(http.get(apiUrl("/v1/extractions/:id"), () => problem(404, { title: "Extraction not found" })));

    await expect(JobPage(params("11111111-1111-4111-8111-111111111111"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalledOnce();
  });

  it("sends an unreachable API to the error page, not to the not-found page", async () => {
    server.use(http.get(apiUrl("/v1/extractions/:id"), () => HttpResponse.error()));

    await expect(JobPage(params("22222222-2222-4222-8222-222222222222"))).rejects.toThrow(/Failed to load/);
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it("says the extraction was not found or expired and links to New document (AC28)", () => {
    const html = renderToStaticMarkup(<JobNotFound />);

    expect(html).toContain("Extraction not found");
    expect(html).toContain("expired");
    expect(html).toMatch(/<a[^>]*href="\/documents\/new"[^>]*>New document<\/a>/);
  });

  it("titles the tab with the form name, and falls back without throwing", async () => {
    const extraction = extractionResponseBuilder.one({ overrides: { template_name: "VAT invoice" } });
    server.use(http.get(apiUrl(`/v1/extractions/${extraction.id}`), () => HttpResponse.json(extraction)));
    await expect(generateMetadata(params(extraction.id))).resolves.toEqual({ title: "Job VAT invoice" });

    server.use(http.get(apiUrl("/v1/extractions/:id"), () => problem(404)));
    await expect(generateMetadata(params("33333333-3333-4333-8333-333333333333"))).resolves.toEqual({ title: "Job" });
  });
});
