import { afterEach, beforeEach, describe, expect, test as it, vi } from "vitest";

const getReadiness = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("~/lib/formlens-api", () => ({ getReadiness }));
vi.mock("~/lib/logger", () => {
  const logger = { warn: vi.fn(), withError: vi.fn(), withMetadata: vi.fn() };
  logger.withError.mockReturnValue(logger);
  logger.withMetadata.mockReturnValue(logger);
  return { default: logger };
});

async function loadCheckWithApiUrl(url: string | undefined) {
  vi.resetModules();
  vi.doMock("~/data/env/server", () => ({ env: { FORMLENS_API_URL: url } }));
  return (await import("./api-health")).checkApiHealth;
}

describe("checkApiHealth with an unusable API address", () => {
  beforeEach(() => {
    getReadiness.mockReset();
    getReadiness.mockResolvedValue({ data: { status: "ready" }, status: 200 });
  });

  afterEach(() => {
    vi.doUnmock("~/data/env/server");
  });

  it.each([
    ["missing", undefined],
    ["not a URL", "not a url"],
    ["empty", ""]
  ])('reports host "unknown" and still answers when FORMLENS_API_URL is %s', async (_label, url) => {
    const checkApiHealth = await loadCheckWithApiUrl(url);

    await expect(checkApiHealth()).resolves.toEqual({ host: "unknown", status: "connected" });
  });

  it("does not throw when the address is unusable and the API is down", async () => {
    getReadiness.mockRejectedValue(new TypeError("fetch failed"));
    const checkApiHealth = await loadCheckWithApiUrl("not a url");

    await expect(checkApiHealth()).resolves.toEqual({ host: "unknown", status: "unavailable" });
  });

  it("never reports credentials from the API address", async () => {
    const checkApiHealth = await loadCheckWithApiUrl("http://user:secret@api.internal:8000/base");

    const health = await checkApiHealth();

    expect(health.host).toBe("api.internal:8000");
    expect(JSON.stringify(health)).not.toContain("secret");
  });
});

describe("checkApiHealth non-200 answers", () => {
  beforeEach(() => {
    getReadiness.mockReset();
  });

  it.each([404, 500, 502, 503])("is unavailable when the probe answers %i", async (status) => {
    getReadiness.mockResolvedValue({ data: {}, status });
    const checkApiHealth = await loadCheckWithApiUrl("http://api.internal:8000");

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: "unavailable" });
  });

  it("is unavailable, without throwing, when the client throws synchronously", async () => {
    getReadiness.mockImplementation(() => {
      throw new Error("sync failure");
    });
    const checkApiHealth = await loadCheckWithApiUrl("http://api.internal:8000");

    await expect(checkApiHealth()).resolves.toEqual({ host: "api.internal:8000", status: "unavailable" });
  });
});
