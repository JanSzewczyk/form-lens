import { afterEach, describe, expect, it, vi } from "vitest";

import { configureApiClient, getHealth, getTemplate, listExtractions, listTemplates } from "./index";

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function requestedUrl(mock: ReturnType<typeof stubFetch>): string {
  return String(mock.mock.calls[0]?.[0]);
}

describe("package entry point", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a generated call through the configured client", async () => {
    const mock = stubFetch({ status: "ok" });
    configureApiClient({ baseUrl: "http://localhost:8000" });

    const result = await getHealth();

    expect(requestedUrl(mock)).toBe("http://localhost:8000/health");
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ status: "ok" });
  });

  it("puts query parameters into the URL", async () => {
    const mock = stubFetch({ items: [] });
    configureApiClient({ baseUrl: "http://localhost:8000" });

    await listTemplates({ limit: 5 });

    expect(new URL(requestedUrl(mock)).searchParams.get("limit")).toBe("5");
  });

  it("sends a repeated status filter as separate parameters, not a comma list", async () => {
    const mock = stubFetch({ items: [] });
    configureApiClient({ baseUrl: "http://localhost:8000" });

    await listExtractions({ status: ["pending", "running"], template_id: "tpl-1", limit: 10 });

    const url = requestedUrl(mock);
    expect(url).toContain("status=pending&status=running");
    expect(url).not.toContain(",");
    const params = new URL(url).searchParams;
    expect(params.getAll("status")).toEqual(["pending", "running"]);
    expect(params.get("template_id")).toBe("tpl-1");
    expect(params.get("limit")).toBe("10");
  });

  it("returns a documented error status as data, narrowed by status", async () => {
    const problem = { type: "about:blank", title: "Not Found", status: 404 };
    stubFetch(problem, 404);
    configureApiClient({ baseUrl: "http://localhost:8000" });

    const result = await getTemplate("missing");

    expect(result.status).toBe(404);
    expect(result.data).toEqual(problem);
  });
});
