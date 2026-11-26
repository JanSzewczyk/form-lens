import type * as React from "react";
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

const third = templateResponseBuilder.one({ overrides: { name: "Delivery note" } });

export const LastOfTwoPagesWithSearch = meta.story({
  args: {
    page: 2,
    result: { pageSize: 2, status: TemplatesStatus.ok, templates: [third], total: 3 },
    search: "invoice"
  },
  name: "Last of two pages, with a search"
});

LastOfTwoPagesWithSearch.test("Shows the rest of the forms with a way back and no Next (AC4)", async ({ canvas }) => {
  await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
  await expect(canvas.getByText("Delivery note")).toBeVisible();
  await expect(canvas.getByText("Page 2 of 2")).toBeVisible();
  await expect(canvas.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
  await expect(canvas.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/documents/new?q=invoice");
});

export const FirstOfTwoPagesWithSearch = meta.story({
  args: {
    result: { pageSize: 2, status: TemplatesStatus.ok, templates: [invoice, lease], total: 3 },
    search: "invoice"
  },
  name: "First of two pages, with a search"
});

FirstOfTwoPagesWithSearch.test("Keeps the search on the next page (AC2, AC4)", async ({ canvas }) => {
  await expect(canvas.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/documents/new?q=invoice&page=2");
  await expect(canvas.queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();
});

export const PagePastTheLast = meta.story({
  args: {
    page: 99,
    result: { pageSize: 2, status: TemplatesStatus.ok, templates: [], total: 3 },
    search: "invoice"
  },
  name: "Page past the last one"
});

PagePastTheLast.test("Says the page does not exist and links to the last page (AC4)", async ({ canvas }) => {
  await expect(canvas.getByText("There is no page 99")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Go to the last page" })).toHaveAttribute(
    "href",
    "/documents/new?q=invoice&page=2"
  );
  await expect(canvas.queryByRole("list", { name: "Forms" })).not.toBeInTheDocument();
  await expect(canvas.queryByText(/Page 99 of/)).not.toBeInTheDocument();
});

const phoneWidth = {
  decorators: [
    (Story: () => React.ReactNode) => (
      <div className="w-[320px]" data-testid="phone">
        <Story />
      </div>
    )
  ],
  globals: { viewport: { isRotated: false, value: "mobile1" } }
};

export const PhoneWidth = meta.story({ ...phoneWidth, name: "Phone width" });

PhoneWidth.test("Fits a 320 px screen without horizontal scroll (AC35)", async ({ canvas }) => {
  const phone = canvas.getByTestId("phone");
  await expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
});

export const PhoneWidthLongName = meta.story({
  ...phoneWidth,
  args: {
    result: {
      pageSize: 12,
      status: TemplatesStatus.ok,
      templates: [
        templateResponseBuilder.one({
          overrides: { description: "Supplier invoices", name: "Supplier_invoice_with_a_very_long_name_and_no_spaces" }
        })
      ],
      total: 1
    }
  },
  name: "Phone width, long form name"
});

PhoneWidthLongName.test(
  "Wraps a long form name without horizontal scroll on a 320 px screen (AC35)",
  async ({ canvas }) => {
    const phone = canvas.getByTestId("phone");
    await expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
  }
);
