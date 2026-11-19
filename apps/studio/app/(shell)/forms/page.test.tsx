import { beforeEach, describe, expect, test as it, vi } from "vitest";

const loadTemplates = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("~/features/templates/server/load-templates", () => ({ loadTemplates }));

import FormsPage from "./page";

type SearchParams = Record<string, string | Array<string> | undefined>;

async function renderPage(searchParams: SearchParams) {
  return FormsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) });
}

describe("FormsPage search params", () => {
  beforeEach(() => {
    loadTemplates.mockReset();
    loadTemplates.mockResolvedValue({ reason: "down", status: "unavailable" });
  });

  it("loads the first page without a search when the URL has no params", async () => {
    await renderPage({});

    expect(loadTemplates).toHaveBeenCalledWith({ page: 1, search: "" });
  });

  it("passes a trimmed search and the page number", async () => {
    await renderPage({ page: "3", q: "  invoice " });

    expect(loadTemplates).toHaveBeenCalledWith({ page: 3, search: "invoice" });
  });

  it("falls back to page 1 for a page that is not a positive number", async () => {
    await renderPage({ page: "0" });
    await renderPage({ page: "abc" });

    expect(loadTemplates).toHaveBeenNthCalledWith(1, { page: 1, search: "" });
    expect(loadTemplates).toHaveBeenNthCalledWith(2, { page: 1, search: "" });
  });

  it("cuts a search to the 100 characters the API accepts", async () => {
    await renderPage({ q: "a".repeat(150) });

    expect(loadTemplates).toHaveBeenCalledWith({ page: 1, search: "a".repeat(100) });
  });

  it("uses the first value of a repeated parameter", async () => {
    await renderPage({ q: ["invoice", "lease"] });

    expect(loadTemplates).toHaveBeenCalledWith({ page: 1, search: "invoice" });
  });
});
