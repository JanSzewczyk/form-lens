import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { ApiHealthStatus } from "~/lib/api-health-types";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { GET } from "./route";

/** The real route and the real health check; only the API answers over HTTP are faked. */
function apiReadinessIs(answer: () => Response) {
  server.use(http.get(apiUrl("/health/ready"), answer));
}

describe("GET /api/formlens-status", () => {
  beforeEach(() => {
    resetLog();
  });

  it("answers the connected state with the API host and no-store (AC3)", async () => {
    apiReadinessIs(() => HttpResponse.json({ status: "ready" }));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual({
      host: "api.internal:8000",
      status: ApiHealthStatus.connected
    });
  });

  it("answers the unavailable state with 200, so the poller can tell it from a Studio failure (AC3)", async () => {
    apiReadinessIs(() => problem(503, { title: "Not ready" }));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ host: "api.internal:8000", status: ApiHealthStatus.unavailable });
  });

  it("answers unavailable, not an error, when the API is down", async () => {
    apiReadinessIs(() => HttpResponse.error());

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ host: "api.internal:8000", status: ApiHealthStatus.unavailable });
  });

  it("never exposes the full API URL, only its host", async () => {
    apiReadinessIs(() => HttpResponse.json({ status: "ready" }));

    const text = await (await GET()).text();

    expect(text).not.toContain("http://");
    expect(text).not.toContain("/base");
  });
});
