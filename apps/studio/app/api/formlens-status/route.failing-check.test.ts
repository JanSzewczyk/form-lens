import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { ApiHealthStatus } from "~/lib/api-health-types";
import { resetLog } from "~/tests/unit/mock-logger";

const checkApiHealth = vi.hoisted(() => vi.fn());

// A health check that throws cannot be produced over HTTP (it never throws by contract), so it stays a module mock.
vi.mock("~/lib/api-health", () => ({ checkApiHealth, readApiHost: () => "localhost:8000" }));
vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { GET } from "./route";

describe("GET /api/formlens-status when the health check misbehaves", () => {
  beforeEach(() => {
    resetLog();
    checkApiHealth.mockReset();
  });

  it("answers unavailable with 200 and no-store, instead of throwing, when the health check rejects", async () => {
    checkApiHealth.mockRejectedValue(new Error("boom"));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ host: "localhost:8000", status: ApiHealthStatus.unavailable });
  });
});
