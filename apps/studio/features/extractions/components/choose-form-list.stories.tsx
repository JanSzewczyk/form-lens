import { expect } from "storybook/test";
import preview from "~/.storybook/preview";
import { TemplatesStatus } from "~/features/templates/types/templates-result";
import { fieldSpecBuilder, templateResponseBuilder } from "~/features/templates/utils/template.builder";

import { ChooseFormList } from "./choose-form-list";

const invoice = templateResponseBuilder.one({
  overrides: { description: "Supplier invoices", fields: fieldSpecBuilder.many(3), name: "VAT invoice" }
});
const lease = templateResponseBuilder.one({ overrides: { name: "Lease agreement" } });

const meta = preview.meta({
  args: {
    page: 1,
    result: { pageSize: 12, status: TemplatesStatus.ok, templates: [invoice, lease], total: 2 },
    search: ""
  },
  component: ChooseFormList,
  title: "Features/Extractions/Choose Form List"
});

export const TwoForms = meta.story({ name: "Two forms" });

TwoForms.test("Shows a card per form with name, description and field count (AC1)", async ({ canvas }) => {
  await expect(canvas.getAllByRole("listitem")).toHaveLength(2);
  await expect(canvas.getByText("VAT invoice")).toBeVisible();
  await expect(canvas.getByText("Supplier invoices")).toBeVisible();
  await expect(canvas.getByText("3 fields")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Select VAT invoice" })).toHaveAttribute(
    "href",
    `/documents/new?template=${invoice.id}`
  );
});

TwoForms.test("Searches on the New document page itself", async ({ canvas }) => {
  await expect(canvas.getByRole("search")).toHaveAttribute("action", "/documents/new");
});

export const SearchResult = meta.story({
  args: { result: { pageSize: 12, status: TemplatesStatus.ok, templates: [invoice], total: 1 }, search: "invoice" },
  name: "Search for invoice"
});

SearchResult.test("Lists only the matching form and keeps the search (AC2)", async ({ canvas }) => {
  await expect(canvas.getByText("VAT invoice")).toBeVisible();
  await expect(canvas.queryByText("Lease agreement")).not.toBeInTheDocument();
  await expect(canvas.getByRole("searchbox", { name: "Search forms" })).toHaveValue("invoice");
});

export const NoForms = meta.story({
  args: { result: { pageSize: 12, status: TemplatesStatus.ok, templates: [], total: 0 } },
  name: "No forms"
});

NoForms.test("Shows the empty state with a link to New form (AC3)", async ({ canvas }) => {
  await expect(canvas.getByText("No forms yet")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "New form" })).toHaveAttribute("href", "/forms/new");
});

export const NoMatch = meta.story({
  args: { result: { pageSize: 12, status: TemplatesStatus.ok, templates: [], total: 0 }, search: "zzz" },
  name: "No match"
});

NoMatch.test("Says no forms match instead of the empty state (AC3)", async ({ canvas }) => {
  await expect(canvas.getByText("No forms match your search")).toBeVisible();
  await expect(canvas.queryByText("No forms yet")).not.toBeInTheDocument();
});

export const FirstOfTwoPages = meta.story({
  args: { result: { pageSize: 2, status: TemplatesStatus.ok, templates: [invoice, lease], total: 3 } },
  name: "First of two pages"
});

FirstOfTwoPages.test("Links to the next page of Choose form (AC4)", async ({ canvas }) => {
  await expect(canvas.getByText("Page 1 of 2")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/documents/new?page=2");
});

export const ApiDown = meta.story({ args: { result: { status: TemplatesStatus.unavailable } }, name: "API down" });

ApiDown.test("Says the forms could not be loaded", async ({ canvas }) => {
  await expect(canvas.getByRole("alert")).toHaveTextContent("The forms could not be loaded");
});
