import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { ApiHealthStatus } from "~/lib/api-health-types";
import { log, resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { checkApiHealth } from "./api-health";

const READY = "/health/ready";

describe("checkApiHealth", () => {
  beforeEach(() => {
    resetLog();
  });

  it("is connected when the readiness probe answers 200, with the API host", async () => {
    server.use(http.get(apiUrl(READY), () => HttpResponse.json({ status: "ready" })));

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: ApiHealthStatus.connected });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("asks without caching, so a poll never gets a stale answer", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    server.use(http.get(apiUrl(READY), () => HttpResponse.json({ status: "ready" })));

    await checkApiHealth();

    expect(fetchSpy).toHaveBeenCalledWith(
      apiUrl(READY),
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) })
    );
  });

  it("is unavailable when the probe answers 503, and logs the status code", async () => {
    server.use(http.get(apiUrl(READY), () => problem(503, { title: "Not ready" })));

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: ApiHealthStatus.unavailable });
    expect(log.withMetadata).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
    expect(log.warn).toHaveBeenCalledOnce();
  });

  it("is unavailable, without throwing, when the network fails, and logs the error", async () => {
    server.use(http.get(apiUrl(READY), () => HttpResponse.error()));

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: ApiHealthStatus.unavailable });
    expect(log.withError).toHaveBeenCalledWith(expect.any(TypeError));
  });

  it("is unavailable, without throwing, when the request times out", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("timed out", "TimeoutError")));
    server.use(http.get(apiUrl(READY), () => HttpResponse.json({ status: "ready" })));

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: ApiHealthStatus.unavailable });
    expect(log.warn).toHaveBeenCalledOnce();
  });

  it("gives the request a 3 s timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    server.use(http.get(apiUrl(READY), () => HttpResponse.json({ status: "ready" })));

    await checkApiHealth();

    expect(timeout).toHaveBeenCalledWith(3000);
  });
});
