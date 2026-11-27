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

/** Long keys without spaces, so the card has to break them to fit a phone. */
const longFields = [
  fieldSpecBuilder.one({ overrides: { name: "supplier_value_added_tax_identification_number" } }),
  fieldSpecBuilder.one({ overrides: { name: "total_amount_due_including_all_taxes_and_discounts" } }),
  ...fieldSpecBuilder.many(6)
];

/** Storybook's preset phones are 320 and 414 px wide; the flow is checked on a 375 px phone. */
const PHONE_VIEWPORTS = {
  phone375: { name: "Phone (375 px)", styles: { height: "667px", width: "375px" }, type: "mobile" }
} as const;

export const PhoneWidth = meta.story({
  args: { template: templateResponseBuilder.one({ overrides: { fields: longFields, name: "Supplier invoice" } }) },
  decorators: [
    (Story) => (
      <div className="w-[375px]" data-testid="phone">
        <Story />
      </div>
    )
  ],
  globals: { viewport: { isRotated: false, value: "phone375" } },
  name: "Phone width, long field names",
  parameters: { viewport: { options: PHONE_VIEWPORTS } }
});

PhoneWidth.test("Fits a 375 px screen without horizontal scroll (AC35)", async ({ canvas }) => {
  await expect(canvas.getAllByRole("listitem")).toHaveLength(longFields.length);
  const phone = canvas.getByTestId("phone");
  await expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
});

PhoneWidth.test(
  "Renders in a 375 px viewport and frame, so the scroll checks mean something (AC35)",
  async ({ canvas }) => {
    await expect(window.innerWidth).toBe(375);
    await expect(canvas.getByTestId("phone").clientWidth).toBe(375);
  }
);

PhoneWidth.test(
  "Keeps every element inside the 375 px frame, with no content spilling out of its box (AC35)",
  async ({ canvas }) => {
    const phone = canvas.getByTestId("phone").getBoundingClientRect();
    const outside = [...canvas.getByTestId("phone").querySelectorAll("*")]
      .map((element) => ({ box: element.getBoundingClientRect(), element }))
      .filter(
        ({ element, box }) =>
          box.width > 1 &&
          (box.right > phone.right + 0.5 ||
            box.left < phone.left - 0.5 ||
            (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1))
      )
      .map(
        ({ element, box }) => `${element.tagName}.${element.className} ${Math.round(box.left)}-${Math.round(box.right)}`
      );

    await expect(outside).toEqual([]);
  }
);
