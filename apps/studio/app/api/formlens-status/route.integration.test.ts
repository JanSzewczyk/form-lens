import { beforeEach, describe, expect, test as it, vi } from "vitest";

const getReadiness = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("~/data/env/server", () => ({ env: { FORMLENS_API_URL: "http://api.internal:8000/base" } }));
vi.mock("~/lib/formlens-api", () => ({ getReadiness }));
vi.mock("~/lib/logger", () => {
  const logger = { warn: vi.fn(), withError: vi.fn(), withMetadata: vi.fn() };
  logger.withError.mockReturnValue(logger);
  logger.withMetadata.mockReturnValue(logger);
  return { default: logger };
});

// The real route and the real checkApiHealth; only the API client and the env are faked.
import { GET } from "./route";

describe("GET /api/formlens-status with the real health check", () => {
  beforeEach(() => {
    getReadiness.mockReset();
  });

  it("answers connected with the API host and no-store when the API is ready", async () => {
    getReadiness.mockResolvedValue({ data: { status: "ready" }, status: 200 });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ host: "api.internal:8000", status: "connected" });
  });

  it("answers unavailable, not an error, when the API is down", async () => {
    getReadiness.mockRejectedValue(new TypeError("fetch failed"));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ host: "api.internal:8000", status: "unavailable" });
  });

  it("answers unavailable when the API reports not ready", async () => {
    getReadiness.mockResolvedValue({ data: { title: "Not ready" }, status: 503 });

    const response = await GET();

    await expect(response.json()).resolves.toEqual({ host: "api.internal:8000", status: "unavailable" });
  });

  it("never exposes the full API URL, only its host", async () => {
    getReadiness.mockResolvedValue({ data: { status: "ready" }, status: 200 });

    const text = await (await GET()).text();

    expect(text).not.toContain("http://");
    expect(text).not.toContain("/base");
  });
});
