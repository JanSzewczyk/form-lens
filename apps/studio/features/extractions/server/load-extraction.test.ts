import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { extractionResponseBuilder } from "~/features/extractions/utils/extraction.builder";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { loadExtraction } from "./load-extraction";

describe("loadExtraction", () => {
  beforeEach(() => {
    resetLog();
  });

  it("returns the view of a 200, with the submit-time fields, file name and form name", async () => {
    const fields = [{ name: "invoice_number", required: true, type: "text" }];
    const extraction = extractionResponseBuilder.one({
      overrides: { fields, filename: "invoice_118_2026.pdf", template_name: "VAT invoice" }
    });
    server.use(http.get(apiUrl(`/v1/extractions/${extraction.id}`), () => HttpResponse.json(extraction)));

    await expect(loadExtraction(extraction.id)).resolves.toEqual({
      extraction: {
        created_at: extraction.created_at,
        fields,
        filename: "invoice_118_2026.pdf",
        id: extraction.id,
        status: extraction.status,
        template_id: extraction.template_id,
        template_name: "VAT invoice"
      },
      status: "found"
    });
  });

  it("reads a cancelled extraction", async () => {
    const extraction = extractionResponseBuilder.one({ overrides: { status: "cancelled" } });
    server.use(http.get(apiUrl("/v1/extractions/:id"), () => HttpResponse.json(extraction)));

    const result = await loadExtraction(extraction.id);

    expect(result.status === "found" ? result.extraction.status : null).toBe("cancelled");
  });

  it("reports a 404, which is also how the API answers an expired result, as not found (AC28)", async () => {
    server.use(http.get(apiUrl("/v1/extractions/:id"), () => problem(404, { title: "Extraction not found" })));

    await expect(loadExtraction("11111111-1111-4111-8111-111111111111")).resolves.toEqual({ status: "not-found" });
  });

  it("reports an id that is not a UUID as not found without asking the API", async () => {
    // No handler: a request would fail the test (unhandled request).
    await expect(loadExtraction("../templates")).resolves.toEqual({ status: "not-found" });
  });

  it("reports another status as unreachable", async () => {
    server.use(http.get(apiUrl("/v1/extractions/:id"), () => problem(503, { title: "Service not ready" })));

    await expect(loadExtraction("22222222-2222-4222-8222-222222222222")).resolves.toEqual({ status: "unreachable" });
  });

  it("reports an answer of an unexpected shape as unreachable", async () => {
    server.use(http.get(apiUrl("/v1/extractions/:id"), () => HttpResponse.json({ id: 1 })));

    await expect(loadExtraction("33333333-3333-4333-8333-333333333333")).resolves.toEqual({ status: "unreachable" });
  });

  it("reports an unreachable API as unreachable instead of throwing", async () => {
    server.use(http.get(apiUrl("/v1/extractions/:id"), () => HttpResponse.error()));

    await expect(loadExtraction("44444444-4444-4444-8444-444444444444")).resolves.toEqual({ status: "unreachable" });
  });
});
