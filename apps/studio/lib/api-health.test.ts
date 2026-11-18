import { afterEach, beforeEach, describe, expect, test as it, vi } from "vitest";

const getReadiness = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("~/data/env/server", () => ({ env: { FORMLENS_API_URL: "http://api.internal:8000/base" } }));
vi.mock("~/lib/formlens-api", () => ({ getReadiness }));
vi.mock("~/lib/logger", () => {
  const logger = { warn, withError: vi.fn(), withMetadata: vi.fn() };
  logger.withError.mockReturnValue(logger);
  logger.withMetadata.mockReturnValue(logger);
  return { default: logger };
});

import { checkApiHealth } from "./api-health";

describe("checkApiHealth", () => {
  beforeEach(() => {
    getReadiness.mockReset();
    warn.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is connected when the readiness probe answers 200, with the API host", async () => {
    getReadiness.mockResolvedValue({ data: { status: "ready" }, status: 200 });

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: "connected" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("asks without caching and with a timeout signal", async () => {
    getReadiness.mockResolvedValue({ data: { status: "ready" }, status: 200 });

    await checkApiHealth();

    expect(getReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) })
    );
  });

  it("is unavailable when the probe answers 503", async () => {
    getReadiness.mockResolvedValue({ data: { title: "Not ready" }, status: 503 });

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: "unavailable" });
    expect(warn).toHaveBeenCalledWith("api_health_not_ready");
  });

  it("is unavailable, without throwing, when the network fails", async () => {
    getReadiness.mockRejectedValue(new TypeError("fetch failed"));

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: "unavailable" });
    expect(warn).toHaveBeenCalledWith("api_health_check_failed");
  });

  it("is unavailable, without throwing, when the request times out", async () => {
    getReadiness.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: "unavailable" });
    expect(warn).toHaveBeenCalledWith("api_health_check_failed");
  });

  it("gives the request a 3 s timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    getReadiness.mockResolvedValue({ data: { status: "ready" }, status: 200 });

    await checkApiHealth();

    expect(timeout).toHaveBeenCalledWith(3000);
  });
});
