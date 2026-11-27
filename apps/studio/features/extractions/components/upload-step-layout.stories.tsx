import { expect, fn } from "storybook/test";
import preview from "~/.storybook/preview";
import type { SubmitFailure } from "~/features/extractions/schemas/extraction";
import { fieldSpecBuilder, templateResponseBuilder } from "~/features/templates/utils/template.builder";

import { UploadStepLayout } from "./upload-step-layout";

/** Long keys without spaces, so the card has to break them to fit a phone. */
const fields = [
  fieldSpecBuilder.one({ overrides: { name: "supplier_value_added_tax_identification_number" } }),
  fieldSpecBuilder.one({ overrides: { name: "total_amount_due_including_all_taxes_and_discounts" } }),
  ...fieldSpecBuilder.many(10)
];

/** Storybook's preset phones are 320 and 414 px wide; the flow is checked on a 375 px phone. */
const PHONE_VIEWPORTS = {
  phone375: { name: "Phone (375 px)", styles: { height: "667px", width: "375px" }, type: "mobile" }
} as const;

const meta = preview.meta({
  args: {
    maxMb: 25,
    onSubmitAction: fn(async (): Promise<SubmitFailure> => ({ error: "unused", kind: "unavailable", success: false })),
    template: templateResponseBuilder.one({ overrides: { fields, name: "Supplier invoice with a long name" } })
  },
  component: UploadStepLayout,
  title: "Features/Extractions/Upload Step Layout"
});

export const WideScreen = meta.story({ name: "Wide screen" });

WideScreen.test("Shows the selected form, the drop zone and the fields to find (AC5, AC6)", async ({ canvas }) => {
  await expect(canvas.getByText("Supplier invoice with a long name")).toBeVisible();
  await expect(canvas.getByRole("button", { name: "Start analysis" })).toBeDisabled();
  await expect(canvas.getAllByRole("listitem")).toHaveLength(fields.length);
});

export const PhoneWidth = meta.story({
  decorators: [
    (Story) => (
      <div className="w-[375px]" data-testid="phone">
        <Story />
      </div>
    )
  ],
  globals: { viewport: { isRotated: false, value: "phone375" } },
  name: "Phone width",
  parameters: { viewport: { options: PHONE_VIEWPORTS } }
});

PhoneWidth.test("Fits a 375 px screen without horizontal scroll (AC35)", async ({ canvas }) => {
  const phone = canvas.getByTestId("phone");
  await expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
});

PhoneWidth.test("Stacks the Fields to find card under the drop zone (AC35)", async ({ canvas }) => {
  const uploadColumnBottom = Math.max(
    canvas.getByRole("button", { name: "Start analysis" }).getBoundingClientRect().bottom,
    canvas.getByRole("link", { name: "Cancel" }).getBoundingClientRect().bottom
  );
  const fieldsCardTop = canvas.getByText("Fields to find").getBoundingClientRect().top;

  await expect(fieldsCardTop).toBeGreaterThanOrEqual(uploadColumnBottom);
});
