import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test as it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/jobs" }));

// The pathname comes from the Next.js router, which does not exist outside a request.
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import { AppBreadcrumbs } from "./app-breadcrumbs";

function breadcrumbsAt(pathname: string): string {
  navigation.pathname = pathname;
  return renderToStaticMarkup(<AppBreadcrumbs />);
}

describe("AppBreadcrumbs on a job", () => {
  it("shows Jobs as a link and the job id as the current page", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const html = breadcrumbsAt(`/jobs/${id}`);

    expect(html).toMatch(/<a[^>]*href="\/jobs"[^>]*>Jobs<\/a>/);
    expect(html).toMatch(new RegExp(`aria-current="page"[^>]*>${id}<`));
  });

  it("adds no id crumb below a job", () => {
    const html = breadcrumbsAt("/jobs/abc/more");

    expect(html).not.toContain(">abc<");
    expect(html).toContain("Jobs");
  });
});
