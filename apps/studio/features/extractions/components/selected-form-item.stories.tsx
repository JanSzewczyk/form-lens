import { expect } from "storybook/test";
import preview from "~/.storybook/preview";
import { fieldSpecBuilder, templateResponseBuilder } from "~/features/templates/utils/template.builder";

import { SelectedFormItem } from "./selected-form-item";

const meta = preview.meta({
  args: {
    template: templateResponseBuilder.one({ overrides: { fields: fieldSpecBuilder.many(8), name: "VAT invoice" } })
  },
  component: SelectedFormItem,
  title: "Features/Extractions/Selected Form Item"
});

export const EightFields = meta.story({ name: "Form with 8 fields" });

EightFields.test("Shows the form name and 8 fields to find (AC5)", async ({ canvas }) => {
  await expect(canvas.getByText("VAT invoice")).toBeVisible();
  await expect(canvas.getByText("8 fields to find")).toBeVisible();
});

EightFields.test("Links Change form back to Choose form (AC7)", async ({ canvas }) => {
  await expect(canvas.getByRole("link", { name: "Change form" })).toHaveAttribute("href", "/documents/new");
});
