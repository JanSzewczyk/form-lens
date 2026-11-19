import { describe, expect, test as it } from "vitest";

import { isCurrentSection, NAV_ITEMS } from "./nav-items";

describe("NAV_ITEMS", () => {
  it("lists Forms, New document and Jobs in that order, each with its own path", () => {
    expect(NAV_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/forms", label: "Forms" },
      { href: "/documents/new", label: "New document" },
      { href: "/jobs", label: "Jobs" }
    ]);
  });
});

describe("isCurrentSection", () => {
  it.each(["/forms", "/forms/new", "/forms/abc/edit"])("marks Forms current for %s", (pathname) => {
    expect(isCurrentSection(pathname, "/forms")).toBe(true);
  });

  it.each(["/formsets", "/forms-archive", "/", "/jobs", "/documents/new"])(
    "does not mark Forms current for %s",
    (pathname) => {
      expect(isCurrentSection(pathname, "/forms")).toBe(false);
    }
  );

  it("does not mark New document current for its parent path /documents", () => {
    expect(isCurrentSection("/documents", "/documents/new")).toBe(false);
  });

  it("marks at most one section current for any path", () => {
    for (const pathname of ["/", "/forms", "/forms/new", "/documents/new", "/jobs", "/jobs/42", "/nope"]) {
      const current = NAV_ITEMS.filter((item) => isCurrentSection(pathname, item.href));
      expect(current.length).toBeLessThanOrEqual(1);
    }
  });
});
