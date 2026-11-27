import { expect } from "storybook/test";
import preview from "~/.storybook/preview";

import { NewDocumentStep, NewDocumentStepper } from "./new-document-stepper";

const meta = preview.meta({
  args: { current: NewDocumentStep.chooseForm },
  component: NewDocumentStepper,
  title: "Features/Extractions/New Document Stepper"
});

export const ChooseFormStep = meta.story({ name: "Choose form step" });

ChooseFormStep.test("Marks Choose form as the current step (AC1)", async ({ canvas }) => {
  await expect(canvas.getByRole("tab", { current: "step" })).toHaveTextContent("Choose form");
  await expect(canvas.getByText("Results")).toBeVisible();
});

export const UploadStep = meta.story({ args: { current: NewDocumentStep.upload }, name: "Upload step" });

UploadStep.test("Marks Upload document current and Choose form completed (AC5)", async ({ canvas, canvasElement }) => {
  await expect(canvas.getByRole("tab", { current: "step" })).toHaveTextContent("Upload document");
  const completed = canvasElement.querySelector('[data-state="completed"]');
  await expect(completed).toHaveTextContent("Choose form");
});

export const PhoneWidth = UploadStep.extend({
  decorators: [
    (Story) => (
      <div className="w-[320px]" data-testid="phone">
        <Story />
      </div>
    )
  ],
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  name: "Phone width"
});

PhoneWidth.test("Stacks the steps on a phone-width screen without horizontal scroll (AC35)", async ({ canvas }) => {
  // The stacking is a viewport rule (below `sm`), so the check only means something on a phone-width viewport.
  await expect(window.matchMedia("(min-width: 640px)").matches).toBe(false);

  const phone = canvas.getByTestId("phone");
  await expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
  const tops = canvas.getAllByRole("tab").map((step) => step.getBoundingClientRect().top);
  await expect(tops[0]).toBeLessThan(tops[1] ?? 0);
  await expect(tops[1]).toBeLessThan(tops[2] ?? 0);
});
