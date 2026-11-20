import { SidebarProvider } from "@szum-tech/design-system";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test as it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/forms" }));

// The pathname comes from the Next.js router, which does not exist outside a request.
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import { AppBreadcrumbs } from "./app-breadcrumbs";
import { SidebarNav } from "./sidebar-nav";

function breadcrumbsAt(pathname: string): string {
  navigation.pathname = pathname;
  return renderToStaticMarkup(<AppBreadcrumbs />);
}

function sidebarAt(pathname: string): string {
  navigation.pathname = pathname;
  return renderToStaticMarkup(
    <SidebarProvider>
      <SidebarNav />
    </SidebarProvider>
  );
}

describe("AppBreadcrumbs", () => {
  it("shows the section alone as the current page on the list", () => {
    const html = breadcrumbsAt("/forms");

    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Forms");
    expect(html).not.toContain("New form");
  });

  it("links the section and names the create page as the current one (AC12)", () => {
    const html = breadcrumbsAt("/forms/new");

    expect(html).toContain('href="/forms"');
    expect(html).toContain("New form");
  });

  it("names the edit page of any form (AC17)", () => {
    const html = breadcrumbsAt("/forms/6f1c1b5e-0f0e-4b1e-9d36-3f0d8f9c2a10/edit");

    expect(html).toContain('href="/forms"');
    expect(html).toContain("Edit form");
  });

  it("shows the placeholder sections without a second level", () => {
    expect(breadcrumbsAt("/jobs")).toContain("Jobs");
    expect(breadcrumbsAt("/documents/new")).toContain("New document");
  });

  it("shows nothing for a path outside the sections", () => {
    expect(breadcrumbsAt("/somewhere-else")).not.toContain("<li");
  });
});

describe("SidebarNav", () => {
  it("lists the three sections and marks only the current one (AC1)", () => {
    const html = sidebarAt("/forms/new");

    for (const label of ["Forms", "New document", "Jobs"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("marks no section on a page outside them", () => {
    expect(sidebarAt("/somewhere-else")).not.toContain("aria-current");
  });
});
