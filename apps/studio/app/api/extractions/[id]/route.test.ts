import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { extractionResponseBuilder } from "~/features/extractions/utils/extraction.builder";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { GET } from "./route";

/** The real route and the real loader; only the API answers over HTTP are faked. */
function get(id: string) {
  return GET(new Request(`http://studio.test/api/extractions/${id}`), { params: Promise.resolve({ id }) });
}

describe("GET /api/extractions/[id]", () => {
  beforeEach(() => {
    resetLog();
  });

  it("answers 200 with the extraction view and no-store", async () => {
    const extraction = extractionResponseBuilder.one({ overrides: { status: "running" } });
    server.use(http.get(apiUrl(`/v1/extractions/${extraction.id}`), () => HttpResponse.json(extraction)));

    const response = await get(extraction.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ id: extraction.id, status: "running" });
  });

  it("answers 404 { notFound } for an unknown or expired extraction (AC28)", async () => {
    server.use(http.get(apiUrl("/v1/extractions/:id"), () => problem(404, { title: "Extraction not found" })));

    const response = await get("11111111-1111-4111-8111-111111111111");

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ notFound: true });
  });

  it("answers 502 { unreachable } when the API does not answer (AC29)", async () => {
    server.use(http.get(apiUrl("/v1/extractions/:id"), () => HttpResponse.error()));

    const response = await get("22222222-2222-4222-8222-222222222222");

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ unreachable: true });
  });

  it("never passes on the API's own error text", async () => {
    server.use(
      http.get(apiUrl("/v1/extractions/:id"), () => problem(500, { detail: "sqlite3.OperationalError: locked" }))
    );

    const text = await (await get("33333333-3333-4333-8333-333333333333")).text();

    expect(text).not.toContain("sqlite3");
  });
});
