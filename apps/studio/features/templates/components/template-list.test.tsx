import type { TemplateResponse } from "@form-lens/api-client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test as it } from "vitest";

import { type TemplatesResult, TemplatesStatus } from "~/features/templates/types/templates-result";
import { fieldSpecBuilder, templateResponseBuilder } from "~/features/templates/utils/template.builder";

import { TemplateList } from "./template-list";

const NOW = new Date("2026-11-19T12:00:00Z");

function ok(templates: Array<TemplateResponse>, total: number): TemplatesResult {
  return { pageSize: 12, status: TemplatesStatus.ok, templates, total };
}

function render(result: TemplatesResult, search = "", page = 1) {
  return renderToStaticMarkup(<TemplateList now={NOW} page={page} result={result} search={search} />);
}

/** The opening tag of the link with this `rel`, whatever the order of its attributes. */
function linkWithRel(html: string, rel: string): string {
  return new RegExp(`<a[^>]*rel="${rel}"[^>]*>`).exec(html)?.[0] ?? "";
}

describe("TemplateList", () => {
  it("shows a fixed message, never text of the API, when the list is unavailable (AC11)", () => {
    const html = render({ status: TemplatesStatus.unavailable });

    expect(html).toContain("The forms could not be loaded");
    expect(html).toContain("The FormLens API is not available");
    expect(html).not.toContain("<ul");
  });

  it("invites the user to create the first form when there are none (AC10)", () => {
    const html = render(ok([], 0));

    expect(html).toContain("No forms yet");
    expect(html).toContain('href="/forms/new"');
    expect(html).not.toContain('role="search"');
  });

  it("says no forms match, and offers to clear the search, for a search with no result", () => {
    const html = render(ok([], 0), "łódź");

    expect(html).toContain("No forms match your search");
    expect(html).toContain("łódź");
    expect(html).toContain('href="/forms"');
    expect(html).not.toContain("No forms yet");
  });

  it("lists a card per template with the count and a New form tile (AC6)", () => {
    const templates = templateResponseBuilder.many(3, { overrides: { description: "A form." } });

    const html = render(ok(templates, 3));

    for (const template of templates) {
      expect(html).toContain(template.name);
      expect(html).toContain(`href="/forms/${template.id}/edit"`);
    }
    expect(html).toContain("3 forms");
    expect(html.match(/href="\/forms\/new"/g)).toHaveLength(1);
  });

  it("counts a single form in the singular", () => {
    expect(render(ok(templateResponseBuilder.many(1), 1))).toContain("1 form<");
  });

  it("sends a page past the end back to the first page, keeping the search", () => {
    const html = render(ok([], 30), "inv", 9);

    expect(html).toContain("There are no forms on this page");
    expect(html).toContain('href="/forms?q=inv"');
  });

  it("sends a page past the end of an unfiltered list to the bare list", () => {
    expect(render(ok([], 30), "", 9)).toContain('href="/forms"');
  });

  it("shows a pager with a link to the next page and the search kept (AC9)", () => {
    const html = render(ok(templateResponseBuilder.many(12), 30), "inv", 1);

    expect(html).toContain("Page 1 of 3");
    expect(html).toContain('href="/forms?q=inv&amp;page=2"');
    expect(html).not.toContain("Previous");
  });

  it("links the middle page to the previous page, which for page 2 is the bare list, and to the next", () => {
    const html = render(ok(templateResponseBuilder.many(12), 36), "", 2);

    expect(linkWithRel(html, "prev")).toContain('href="/forms"');
    expect(linkWithRel(html, "next")).toContain('href="/forms?page=3"');
  });

  it("shows no pager on the last page's next link and none when everything fits one page", () => {
    expect(render(ok(templateResponseBuilder.many(12), 12))).not.toContain('aria-label="Pages"');
    expect(render(ok(templateResponseBuilder.many(2), 14), "", 2)).not.toContain('rel="next"');
  });
});

describe("TemplateCard last-used date", () => {
  function card(lastUsedAt: string | null, fieldCount = 1) {
    const template = templateResponseBuilder.one({
      overrides: { fields: fieldSpecBuilder.many(fieldCount), last_used_at: lastUsedAt }
    });
    return render(ok([template], 1));
  }

  it("says Never used for a template that was never used (AC7)", () => {
    expect(card(null)).toContain("Never used");
  });

  it.each([
    ["2026-11-19T09:00:00Z", "Last used today"],
    ["2026-11-20T09:00:00Z", "Last used today"],
    ["2026-11-09T12:00:00Z", "Last used 10 days ago"],
    ["2026-08-19T12:00:00Z", "Last used 3 months ago"],
    ["2025-11-19T12:00:00Z", "Last used last year"]
  ])("counts %s back from now as %s", (lastUsedAt, text) => {
    expect(card(lastUsedAt)).toContain(text);
  });

  it("counts fields in the singular and the plural", () => {
    expect(card(null, 1)).toContain("1 field<");
    expect(card(null, 0)).toContain("0 fields");
    expect(card(null, 4)).toContain("4 fields");
  });
});
