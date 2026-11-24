import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

// The configuration is module state, so every test loads a fresh copy of the module.
async function loadFetcher() {
  vi.resetModules();
  return import("./fetcher");
}

function stubFetch(response: Response): FetchMock {
  const mock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function sentRequest(mock: FetchMock): { url: string; init: RequestInit } {
  const [url, init] = mock.mock.calls[0] ?? [];
  return { url: String(url), init: init ?? {} };
}

describe("customFetch", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses to send a request before the client is configured", async () => {
    const { customFetch } = await loadFetcher();
    const mock = stubFetch(jsonResponse({}));

    await expect(customFetch("/health", { method: "GET" })).rejects.toThrow("not configured");
    expect(mock).not.toHaveBeenCalled();
  });

  it("resolves the path against the configured base URL", async () => {
    const { configureApiClient, customFetch } = await loadFetcher();
    const mock = stubFetch(jsonResponse({ status: "ok" }));
    configureApiClient({ baseUrl: "http://localhost:8000" });

    await customFetch("/v1/templates?limit=5", { method: "GET" });

    expect(sentRequest(mock).url).toBe("http://localhost:8000/v1/templates?limit=5");
  });

  it.each(["//evil.example/v1/templates", "https://evil.example/v1/templates"])(
    "refuses a path that leaves the configured origin: %s",
    async (path) => {
      const { configureApiClient, customFetch } = await loadFetcher();
      const mock = stubFetch(jsonResponse({}));
      configureApiClient({ baseUrl: "http://localhost:8000" });

      await expect(customFetch(path, { method: "GET" })).rejects.toThrow("outside the configured");
      expect(mock).not.toHaveBeenCalled();
    },
  );

  it("returns data, status and headers for a JSON response", async () => {
    const { configureApiClient, customFetch } = await loadFetcher();
    stubFetch(jsonResponse({ id: "t1" }, { status: 201, headers: { "content-type": "application/json", etag: "v1" } }));
    configureApiClient({ baseUrl: "http://localhost:8000" });

    const result = await customFetch<{ data: unknown; status: number; headers: Headers }>("/v1/templates", {
      method: "POST",
    });

    expect(result.status).toBe(201);
    expect(result.data).toEqual({ id: "t1" });
    expect(result.headers.get("etag")).toBe("v1");
  });

  it("returns an error status as a value instead of throwing", async () => {
    const { configureApiClient, customFetch } = await loadFetcher();
    const problem = { type: "about:blank", title: "Not Found", status: 404 };
    stubFetch(jsonResponse(problem, { status: 404, headers: { "content-type": "application/problem+json" } }));
    configureApiClient({ baseUrl: "http://localhost:8000" });

    const result = await customFetch<{ data: unknown; status: number }>("/v1/templates/x", { method: "GET" });

    expect(result).toMatchObject({ status: 404, data: problem });
  });

  it("returns a non-JSON body as text", async () => {
    const { configureApiClient, customFetch } = await loadFetcher();
    stubFetch(new Response("pong", { status: 200, headers: { "content-type": "text/plain" } }));
    configureApiClient({ baseUrl: "http://localhost:8000" });

    const result = await customFetch<{ data: unknown }>("/ping", { method: "GET" });

    expect(result.data).toBe("pong");
  });

  it("treats a body without a content type as text", async () => {
    const { configureApiClient, customFetch } = await loadFetcher();
    // A string body gets `text/plain` from the Response constructor; bytes get no content type at all.
    stubFetch(new Response(new TextEncoder().encode("raw"), { status: 200 }));
    configureApiClient({ baseUrl: "http://localhost:8000" });

    const result = await customFetch<{ data: unknown }>("/raw", { method: "GET" });

    expect(result.data).toBe("raw");
  });

  it.each([204, 205, 304])("returns no body for status %i", async (status) => {
    const { configureApiClient, customFetch } = await loadFetcher();
    stubFetch(new Response(null, { status }));
    configureApiClient({ baseUrl: "http://localhost:8000" });

    const result = await customFetch<{ data: unknown; status: number }>("/v1/templates/t1", { method: "DELETE" });

    expect(result).toMatchObject({ status, data: undefined });
  });

  it("returns no body for an empty response", async () => {
    const { configureApiClient, customFetch } = await loadFetcher();
    stubFetch(new Response("", { status: 200, headers: { "content-type": "application/json" } }));
    configureApiClient({ baseUrl: "http://localhost:8000" });

    const result = await customFetch<{ data: unknown }>("/empty", { method: "GET" });

    expect(result.data).toBeUndefined();
  });

  it("sends the configured headers, and a header of the call wins over the configured one", async () => {
    const { configureApiClient, customFetch } = await loadFetcher();
    const mock = stubFetch(jsonResponse({}));
    configureApiClient({
      baseUrl: "http://localhost:8000",
      headers: { authorization: "Bearer configured", "x-client": "studio" },
    });

    await customFetch("/v1/templates", { method: "GET", headers: { authorization: "Bearer call", accept: "application/json" } });

    const headers = new Headers(sentRequest(mock).init.headers);
    expect(headers.get("authorization")).toBe("Bearer call");
    expect(headers.get("x-client")).toBe("studio");
    expect(headers.get("accept")).toBe("application/json");
  });

  it("passes the method and body of the call to fetch", async () => {
    const { configureApiClient, customFetch } = await loadFetcher();
    const mock = stubFetch(jsonResponse({}));
    configureApiClient({ baseUrl: "http://localhost:8000" });

    await customFetch("/v1/templates", { method: "POST", body: JSON.stringify({ name: "Invoice" }) });

    expect(sentRequest(mock).init).toMatchObject({ method: "POST", body: '{"name":"Invoice"}' });
  });

  it("uses the latest configuration", async () => {
    const { configureApiClient, customFetch } = await loadFetcher();
    const mock = stubFetch(jsonResponse({}));
    configureApiClient({ baseUrl: "http://localhost:8000" });
    configureApiClient({ baseUrl: "https://api.example.com" });

    await customFetch("/health", { method: "GET" });

    expect(sentRequest(mock).url).toBe("https://api.example.com/health");
  });
});
