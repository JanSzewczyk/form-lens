import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { templateResponseBuilder } from "~/features/templates/utils/template.builder";
import { log, resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { loadTemplates } from "./load-templates";

const firstPage = { page: 1, search: "" };

/** Answers `GET /v1/templates` with a page and records the query the loader sent. */
function answerWithPage(page: { items?: Array<unknown>; total: number }) {
  const queries: Array<URLSearchParams> = [];
  server.use(
    http.get(apiUrl("/v1/templates"), ({ request }) => {
      queries.push(new URL(request.url).searchParams);
      return HttpResponse.json({ items: [], limit: 12, offset: 0, ...page });
    })
  );
  return queries;
}

describe("loadTemplates", () => {
  beforeEach(() => {
    resetLog();
  });

  it("returns the items, the total and the page size of a 200", async () => {
    const templates = templateResponseBuilder.many(2);
    answerWithPage({ items: templates, total: 41 });

    await expect(loadTemplates(firstPage)).resolves.toEqual({
      pageSize: 12,
      status: "ok",
      templates,
      total: 41
    });
  });

  it("forwards the search to the API", async () => {
    const queries = answerWithPage({ total: 0 });

    await loadTemplates({ page: 1, search: "invoice" });

    expect(queries[0]?.get("search")).toBe("invoice");
    expect(queries[0]?.get("limit")).toBe("12");
    expect(queries[0]?.get("offset")).toBe("0");
  });

  it("leaves the search out when it is empty", async () => {
    const queries = answerWithPage({ total: 0 });

    await loadTemplates(firstPage);

    expect(queries[0]?.has("search")).toBe(false);
  });

  it("maps page 3 to an offset of two pages", async () => {
    const queries = answerWithPage({ total: 30 });

    await loadTemplates({ page: 3, search: "" });

    expect(queries[0]?.get("offset")).toBe("24");
  });

  it("sends no search for a whitespace-only one (the loader does not rely on its caller to trim)", async () => {
    const queries = answerWithPage({ total: 0 });

    await loadTemplates({ page: 1, search: "   " });

    expect(queries[0]?.has("search")).toBe(false);
  });

  it("keeps an empty last page an ok result with its total", async () => {
    answerWithPage({ total: 30 });

    await expect(loadTemplates({ page: 9, search: "" })).resolves.toEqual({
      pageSize: 12,
      status: "ok",
      templates: [],
      total: 30
    });
  });

  it("reports a refusal as unavailable, without the API's own text, and logs it with its status code", async () => {
    server.use(http.get(apiUrl("/v1/templates"), () => problem(422, { title: "Unprocessable content: secret-table" })));

    const result = await loadTemplates(firstPage);

    expect(result).toEqual({ status: "unavailable" });
    expect(log.withMetadata).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
  });

  it("reports a refusal whose body is empty as unavailable instead of throwing", async () => {
    server.use(http.get(apiUrl("/v1/templates"), () => new HttpResponse(null, { status: 500 })));

    await expect(loadTemplates(firstPage)).resolves.toEqual({ status: "unavailable" });
  });

  it("reports an unreachable API as unavailable instead of throwing, and logs the error", async () => {
    server.use(http.get(apiUrl("/v1/templates"), () => HttpResponse.error()));

    await expect(loadTemplates(firstPage)).resolves.toEqual({ status: "unavailable" });
    expect(log.withError).toHaveBeenCalledWith(expect.any(TypeError));
  });

  it("gives the request a 3 s timeout signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    answerWithPage({ total: 0 });

    await loadTemplates(firstPage);

    expect(timeout).toHaveBeenCalledWith(3000);
  });

  it("reports a stalled API as unavailable once the timeout signal aborts", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("timed out", "TimeoutError")));
    answerWithPage({ total: 0 });

    await expect(loadTemplates(firstPage)).resolves.toEqual({ status: "unavailable" });
  });
});
