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
