import { FieldType, type TemplateResponse } from "@form-lens/api-client";
import { expect } from "storybook/test";
import preview from "~/.storybook/preview";
import type { TemplatesResult } from "~/features/templates/server/load-templates";

import { TemplateList } from "./template-list";

const NOW = new Date("2026-11-19T12:00:00Z");

/** Test data without a builder: `mimicry-js` and Faker are not Studio dependencies. */
function buildTemplate(overrides: Partial<TemplateResponse>): TemplateResponse {
  return {
    created_at: "2026-01-02T08:00:00Z",
    description: "A form.",
    fields: [{ name: "invoice_number", type: FieldType.text }],
    id: "template-1",
    json_schema: {},
    last_used_at: null,
    name: "Invoice",
    updated_at: "2026-01-02T08:00:00Z",
    version: 1,
    ...overrides
  };
}

const THREE_TEMPLATES: Array<TemplateResponse> = [
  buildTemplate({
    description: "Supplier invoice with VAT.",
    fields: [
      { name: "invoice_number", type: FieldType.text },
      { name: "total", type: FieldType.number }
    ],
    id: "t-1",
    last_used_at: "2026-11-18T09:00:00Z",
    name: "VAT invoice"
  }),
  buildTemplate({ description: "Residential lease.", id: "t-2", last_used_at: null, name: "Lease agreement" }),
  buildTemplate({
    description: "Delivery note.",
    fields: [
      { name: "number", type: FieldType.text },
      { name: "date", type: FieldType.date },
      { name: "carrier", type: FieldType.text }
    ],
    id: "t-3",
    last_used_at: "2026-11-09T09:00:00Z",
    name: "Delivery note"
  })
];

/** A successful answer; the type keeps `status` a literal so the stories type-check against the result union. */
function okResult(templates: Array<TemplateResponse>, total: number): TemplatesResult {
  return { pageSize: 12, status: "ok", templates, total };
}

const UNAVAILABLE: TemplatesResult = { reason: "The FormLens API does not answer.", status: "unavailable" };

const meta = preview.meta({
  args: {
    now: NOW,
    page: 1,
    result: okResult(THREE_TEMPLATES, THREE_TEMPLATES.length),
    search: ""
  },
  component: TemplateList,
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    )
  ],
  parameters: { layout: "fullscreen" },
  title: "Features/Templates/Template List"
});

export const ThreeForms = meta.story({ name: "Three forms" });

ThreeForms.test("Shows a card per template and the count 3 forms", async ({ canvas }) => {
  await expect(canvas.getByText(`${THREE_TEMPLATES.length} forms`)).toBeVisible();
  await expect(canvas.getAllByRole("listitem")).toHaveLength(THREE_TEMPLATES.length + 1);
  await expect(canvas.getByText("VAT invoice")).toBeVisible();
  await expect(canvas.getByText("Supplier invoice with VAT.")).toBeVisible();
  await expect(canvas.getByText("2 fields")).toBeVisible();
  await expect(canvas.getByText("Last used yesterday")).toBeVisible();
  await expect(canvas.getByText("Last used 10 days ago")).toBeVisible();
});

ThreeForms.test("Shows Never used for a template that was never used", async ({ canvas }) => {
  await expect(canvas.getByText("Never used")).toBeVisible();
});

ThreeForms.test("Ends the grid with a New form tile that opens the create page", async ({ canvas }) => {
  await expect(canvas.getByRole("link", { name: /^new form/i })).toHaveAttribute("href", "/forms/new");
});

ThreeForms.test("Shows no pager while everything fits on one page", async ({ canvas }) => {
  await expect(canvas.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
});

export const OneForm = meta.story({
  args: { result: okResult(THREE_TEMPLATES.slice(0, 1), 1) },
  name: "One form"
});

OneForm.test("Counts a single form in the singular", async ({ canvas }) => {
  await expect(canvas.getByText("1 form")).toBeVisible();
});

export const SecondPage = meta.story({
  args: {
    page: 2,
    result: okResult(THREE_TEMPLATES, 15),
    search: "form"
  },
  name: "Second page"
});

SecondPage.test("Offers the previous page and keeps the search in its link", async ({ canvas }) => {
  await expect(canvas.getByText("15 forms")).toBeVisible();
  await expect(canvas.getByText("Page 2 of 2")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/forms?q=form");
  await expect(canvas.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
});

export const FirstOfTwoPages = meta.story({
  args: { result: okResult(THREE_TEMPLATES, 15) },
  name: "First of two pages"
});

FirstOfTwoPages.test("Offers the next page, so the rest of the forms can be reached", async ({ canvas }) => {
  await expect(canvas.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/forms?page=2");
  await expect(canvas.queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();
});

export const SearchResult = meta.story({
  args: {
    result: okResult(THREE_TEMPLATES.slice(0, 1), 1),
    search: "invoice"
  },
  name: "Search result"
});

SearchResult.test("Keeps the search in the box and lists only the match", async ({ canvas }) => {
  await expect(canvas.getByRole("searchbox", { name: "Search forms" })).toHaveValue("invoice");
  await expect(canvas.getByText("VAT invoice")).toBeVisible();
  await expect(canvas.queryByText("Lease agreement")).not.toBeInTheDocument();
});

export const NoForms = meta.story({
  args: { result: okResult([], 0) },
  name: "No forms"
});

NoForms.test("Invites the user to create the first form", async ({ canvas }) => {
  await expect(canvas.getByText("No forms yet")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Create your first form" })).toHaveAttribute("href", "/forms/new");
  await expect(canvas.queryByRole("searchbox")).not.toBeInTheDocument();
});

export const NoMatches = meta.story({
  args: { result: okResult([], 0), search: "contract" },
  name: "No matches"
});

NoMatches.test("Says no forms match instead of inviting to create the first form", async ({ canvas }) => {
  await expect(canvas.getByText("No forms match your search")).toBeVisible();
  await expect(canvas.queryByText("No forms yet")).not.toBeInTheDocument();
  await expect(canvas.queryByRole("link", { name: "Create your first form" })).not.toBeInTheDocument();
  await expect(canvas.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/forms");
});

export const ApiUnavailable = meta.story({
  args: { result: UNAVAILABLE },
  name: "API unavailable"
});

ApiUnavailable.test("Shows an error message instead of the list", async ({ canvas }) => {
  await expect(canvas.getByRole("alert")).toHaveTextContent("The forms could not be loaded");
  await expect(canvas.queryByRole("list")).not.toBeInTheDocument();
  await expect(canvas.queryByText("No forms yet")).not.toBeInTheDocument();
});

export const ExactlyOnePage = meta.story({
  args: { result: okResult(THREE_TEMPLATES, 12) },
  name: "Exactly one page of forms"
});

ExactlyOnePage.test("Shows no pager for exactly 12 forms", async ({ canvas }) => {
  await expect(canvas.getByText("12 forms")).toBeVisible();
  await expect(canvas.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
});

export const OneFormOverOnePage = meta.story({
  args: { result: okResult(THREE_TEMPLATES, 13) },
  name: "One form over one page"
});

OneFormOverOnePage.test("Shows a pager with a second page for 13 forms", async ({ canvas }) => {
  await expect(canvas.getByText("Page 1 of 2")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/forms?page=2");
});

export const MiddlePage = meta.story({
  args: { page: 2, result: okResult(THREE_TEMPLATES, 30) },
  name: "Middle page"
});

MiddlePage.test("Links page 2 of 3 back to the bare list and on to page 3", async ({ canvas }) => {
  await expect(canvas.getByText("Page 2 of 3")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/forms");
  await expect(canvas.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/forms?page=3");
});

export const SearchWithSpecialCharacters = meta.story({
  args: { result: okResult(THREE_TEMPLATES, 30), search: "R&D / a=b #1" },
  name: "Search with special characters"
});

SearchWithSpecialCharacters.test("Carries the whole search through the pager link", async ({ canvas }) => {
  const href = canvas.getByRole("link", { name: "Next" }).getAttribute("href") ?? "";
  const url = new URL(href, "http://studio.test");

  await expect(url.pathname).toBe("/forms");
  await expect(url.searchParams.get("q")).toBe("R&D / a=b #1");
  await expect(url.searchParams.get("page")).toBe("2");
});

export const PagePastTheEnd = meta.story({
  args: { page: 9, result: okResult([], 30), search: "R&D" },
  name: "Page past the end"
});

PagePastTheEnd.test(
  "Says there are no forms on this page and links back to page 1 of the search",
  async ({ canvas }) => {
    await expect(canvas.getByText("There are no forms on this page")).toBeVisible();
    await expect(canvas.queryByText("No forms yet")).not.toBeInTheDocument();
    await expect(canvas.queryByText("No forms match your search")).not.toBeInTheDocument();
    const href = canvas.getByRole("link", { name: /first page/i }).getAttribute("href") ?? "";
    await expect(new URL(href, "http://studio.test").searchParams.get("q")).toBe("R&D");
    await expect(new URL(href, "http://studio.test").searchParams.has("page")).toBe(false);
  }
);

export const UnavailableWhileSearching = meta.story({
  args: { result: UNAVAILABLE, search: "invoice" },
  name: "API unavailable while searching"
});

UnavailableWhileSearching.test("Shows the error, not an empty or no-match state", async ({ canvas }) => {
  await expect(canvas.getByRole("alert")).toHaveTextContent("The FormLens API is not available");
  await expect(canvas.queryByText("No forms match your search")).not.toBeInTheDocument();
  await expect(canvas.queryByRole("link", { name: /create your first form/i })).not.toBeInTheDocument();
  await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
});
