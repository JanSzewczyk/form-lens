import { FieldType, type TemplateResponse } from "@form-lens/api-client";
import { expect } from "storybook/test";
import preview from "~/.storybook/preview";

import { TemplateCard } from "./template-card";

const NOW = new Date("2026-11-19T12:00:00Z");

/**
 * Test data without a builder: `mimicry-js` and Faker are not Studio dependencies. Every value a test asserts on
 * is passed in, so nothing here is random.
 */
function buildTemplate(overrides: Partial<TemplateResponse> & { fieldCount?: number }): TemplateResponse {
  const { fieldCount = 3, ...rest } = overrides;
  return {
    created_at: "2026-01-02T08:00:00Z",
    description: "Fields of a supplier invoice.",
    fields: Array.from({ length: fieldCount }, (_, index) => ({ name: `field_${index + 1}`, type: FieldType.text })),
    id: "template-1",
    json_schema: {},
    last_used_at: null,
    name: "VAT invoice",
    updated_at: "2026-01-02T08:00:00Z",
    version: 1,
    ...rest
  };
}

const meta = preview.meta({
  args: { now: NOW, template: buildTemplate({ last_used_at: "2026-11-16T09:30:00Z" }) },
  component: TemplateCard,
  decorators: [
    (Story) => (
      <div className="max-w-[340px] p-8">
        <Story />
      </div>
    )
  ],
  title: "Features/Templates/Template Card"
});

export const UsedTemplate = meta.story({ name: "Used template" });

UsedTemplate.test("Shows the name, description, field count and last-used date", async ({ canvas }) => {
  await expect(canvas.getByText("VAT invoice")).toBeVisible();
  await expect(canvas.getByText("Fields of a supplier invoice.")).toBeVisible();
  await expect(canvas.getByText("3 fields")).toBeVisible();
  await expect(canvas.getByText("Last used 3 days ago")).toBeVisible();
});

UsedTemplate.test(
  "Links Use form to the Upload step for this template and Edit to its editor (AC6)",
  async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Use form" })).toHaveAttribute(
      "href",
      "/documents/new?template=template-1"
    );
    await expect(canvas.getByRole("link", { name: /^edit/i })).toHaveAttribute("href", "/forms/template-1/edit");
  }
);

export const NeverUsedTemplate = meta.story({
  args: { template: buildTemplate({ fieldCount: 1, last_used_at: null }) },
  name: "Never used template"
});

NeverUsedTemplate.test("Says Never used and counts one field in the singular", async ({ canvas }) => {
  await expect(canvas.getByText("Never used")).toBeVisible();
  await expect(canvas.queryByText(/last used/i)).not.toBeInTheDocument();
  await expect(canvas.getByText("1 field")).toBeVisible();
});

export const UsedLongAgoTemplate = meta.story({
  args: { template: buildTemplate({ last_used_at: "2026-08-19T09:30:00Z" }) },
  name: "Used months ago"
});

UsedLongAgoTemplate.test("Counts an old date in months", async ({ canvas }) => {
  await expect(canvas.getByText("Last used 3 months ago")).toBeVisible();
});

export const UsedTodayTemplate = meta.story({
  args: { template: buildTemplate({ last_used_at: "2026-11-19T10:00:00Z" }) },
  name: "Used today"
});

UsedTodayTemplate.test("Says today for a use a few hours ago", async ({ canvas }) => {
  await expect(canvas.getByText("Last used today")).toBeVisible();
});

export const UsedInTheFutureTemplate = meta.story({
  args: { template: buildTemplate({ last_used_at: "2026-11-19T15:00:00Z" }) },
  name: "Used in the future (clock skew)"
});

UsedInTheFutureTemplate.test(
  "Never shows a future date: a use ahead of the clock reads as today",
  async ({ canvas }) => {
    await expect(canvas.getByText("Last used today")).toBeVisible();
    await expect(canvas.queryByText(/\bin \d|tomorrow|next/i)).not.toBeInTheDocument();
  }
);

export const UsedLastYearTemplate = meta.story({
  args: { template: buildTemplate({ last_used_at: "2025-11-19T09:30:00Z" }) },
  name: "Used a year ago"
});

UsedLastYearTemplate.test("Counts a date one year back in years, not in 12 months", async ({ canvas }) => {
  await expect(canvas.getByText("Last used last year")).toBeVisible();
});

export const UsedTwentyNineDaysAgoTemplate = meta.story({
  args: { template: buildTemplate({ last_used_at: "2026-10-21T09:30:00Z" }) },
  name: "Used 29 days ago"
});

UsedTwentyNineDaysAgoTemplate.test("Counts 29 days in days", async ({ canvas }) => {
  await expect(canvas.getByText("Last used 29 days ago")).toBeVisible();
});

export const NoFieldsTemplate = meta.story({
  args: { template: buildTemplate({ fieldCount: 0 }) },
  name: "No fields"
});

NoFieldsTemplate.test("Counts zero fields in the plural", async ({ canvas }) => {
  await expect(canvas.getByText("0 fields")).toBeVisible();
});
