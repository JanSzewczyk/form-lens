import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import FormsPage from "./page";

type SearchParams = Record<string, string | Array<string> | undefined>;

/** The queries the page sent to the API: what the URL of the page turned into. */
const apiQueries: Array<URLSearchParams> = [];

async function renderPage(searchParams: SearchParams) {
  return FormsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) });
}

/** The API's `search` and `offset` for the URL of the page. */
async function queryOf(searchParams: SearchParams) {
  apiQueries.length = 0;
  await renderPage(searchParams);
  const query = apiQueries[0];
  return { offset: query?.get("offset"), search: query?.get("search") };
}

describe("FormsPage search params", () => {
  beforeEach(() => {
    resetLog();
    apiQueries.length = 0;
    server.use(
      http.get(apiUrl("/v1/templates"), ({ request }) => {
        apiQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [], limit: 12, offset: 0, total: 0 });
      })
    );
  });

  it("loads the first page without a search when the URL has no params", async () => {
    await expect(queryOf({})).resolves.toEqual({ offset: "0", search: null });
  });

  it("passes a trimmed search and the page number", async () => {
    await expect(queryOf({ page: "3", q: "  invoice " })).resolves.toEqual({ offset: "24", search: "invoice" });
  });

  it.each(["0", "abc", "-2", "1.5"])("falls back to page 1 for the page %s", async (page) => {
    await expect(queryOf({ page })).resolves.toEqual({ offset: "0", search: null });
  });

  it("cuts a search to the 100 characters the API accepts", async () => {
    await expect(queryOf({ q: "a".repeat(150) })).resolves.toEqual({ offset: "0", search: "a".repeat(100) });
  });

  it("uses the first value of a repeated parameter", async () => {
    await expect(queryOf({ q: ["invoice", "lease"] })).resolves.toEqual({ offset: "0", search: "invoice" });
  });

  it("keeps the offset of a huge page number inside what the API accepts, so the list is not reported as down", async () => {
    const { offset } = await queryOf({ page: "999999999" });

    expect(Number(offset)).toBeLessThanOrEqual(2 ** 31 - 1);
  });

  it("treats a whitespace-only search as no search", async () => {
    await expect(queryOf({ q: "   " })).resolves.toEqual({ offset: "0", search: null });
  });

  it("still renders when the API refuses the request", async () => {
    server.use(http.get(apiUrl("/v1/templates"), () => problem(500)));

    await expect(renderPage({})).resolves.toBeDefined();
  });
});
