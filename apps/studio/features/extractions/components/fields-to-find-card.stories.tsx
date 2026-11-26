import { FieldType } from "@form-lens/api-client";
import { expect } from "storybook/test";
import preview from "~/.storybook/preview";
import { fieldSpecBuilder, templateResponseBuilder } from "~/features/templates/utils/template.builder";

import { FieldsToFindCard } from "./fields-to-find-card";

const fields = [
  ...fieldSpecBuilder.many(7, { overrides: { type: FieldType.text } }),
  fieldSpecBuilder.one({ overrides: { name: "total_amount", type: FieldType.number } })
];

const meta = preview.meta({
  args: { template: templateResponseBuilder.one({ overrides: { fields, name: "VAT invoice" } }) },
  component: FieldsToFindCard,
  title: "Features/Extractions/Fields To Find Card"
});

export const EightFields = meta.story({ name: "Form with 8 fields" });

EightFields.test("Lists the 8 keys with their types in form order (AC5)", async ({ canvas }) => {
  await expect(canvas.getByText("From the “VAT invoice” form")).toBeVisible();
  const rows = canvas.getAllByRole("listitem");
  await expect(rows.map((row) => row.textContent)).toEqual(fields.map((field) => `${field.name}${field.type}`));
});
