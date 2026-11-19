import * as React from "react";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

const loadTemplates = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("~/features/templates/server/load-templates", () => ({ loadTemplates }));

import { ActionToast } from "~/features/templates/components/action-toast";

import FormsPage from "./page";

type SearchParams = Record<string, string | Array<string> | undefined>;

async function renderPage(searchParams: SearchParams) {
  return FormsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) });
}

/** The `flag` the page hands to the toast: the first child of the page's fragment is the `ActionToast` element. */
async function toastFlag(searchParams: SearchParams) {
  const page = await renderPage(searchParams);
  const children = React.Children.toArray(page.props.children);
  const toast = children.find((child) => React.isValidElement(child) && child.type === ActionToast);
  return React.isValidElement<{ flag: string | null }>(toast) ? toast.props.flag : undefined;
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

  it("keeps the offset of a huge page number inside what the API accepts, so the list is not reported as down", async () => {
    const maxOffset = 2 ** 31 - 1;

    await renderPage({ page: "999999999" });

    const { page } = loadTemplates.mock.calls[0]?.[0] as { page: number };
    expect((page - 1) * 12).toBeLessThanOrEqual(maxOffset);
  });

  it("treats a whitespace-only search as no search", async () => {
    await renderPage({ q: "   " });

    expect(loadTemplates).toHaveBeenCalledWith({ page: 1, search: "" });
  });

  it("ignores a negative or fractional page", async () => {
    await renderPage({ page: "-2" });
    await renderPage({ page: "1.5" });

    expect(loadTemplates).toHaveBeenNthCalledWith(1, { page: 1, search: "" });
    expect(loadTemplates).toHaveBeenNthCalledWith(2, { page: 1, search: "" });
  });
});

describe("FormsPage toast flag", () => {
  beforeEach(() => {
    loadTemplates.mockReset();
    loadTemplates.mockResolvedValue({ reason: "down", status: "unavailable" });
  });

  it.each(["created", "saved", "deleted"])("hands the %s flag of ?%s=1 to the toast", async (flag) => {
    await expect(toastFlag({ [flag]: "1" })).resolves.toBe(flag);
  });

  it("hands the toast no flag when the URL has none", async () => {
    await expect(toastFlag({})).resolves.toBeNull();
  });

  it("ignores a flag whose value is not 1", async () => {
    await expect(toastFlag({ created: "0" })).resolves.toBeNull();
  });

  it("reads the first value of a repeated flag", async () => {
    await expect(toastFlag({ saved: ["1", "0"] })).resolves.toBe("saved");
    await expect(toastFlag({ saved: ["0", "1"] })).resolves.toBeNull();
  });
});
