import { expect } from "storybook/test";
import preview from "~/.storybook/preview";
import { ExtractionViewStatus } from "~/features/extractions/schemas/extraction";

import { StatusStepper } from "./status-stepper";

const meta = preview.meta({
  args: { status: ExtractionViewStatus.pending },
  component: StatusStepper,
  title: "Features/Extractions/Status Stepper"
});

export const Pending = meta.story({});

Pending.test("Marks Uploaded completed and Waiting in queue current (AC19)", async ({ canvas, canvasElement }) => {
  await expect(canvas.getByRole("tab", { current: "step" })).toHaveTextContent("Waiting in queue");
  await expect(canvasElement.querySelector('[data-state="completed"]')).toHaveTextContent("Uploaded");
});

export const Running = meta.story({ args: { status: ExtractionViewStatus.running } });

Running.test("Marks Reading document current (AC20)", async ({ canvas }) => {
  await expect(canvas.getByRole("tab", { current: "step" })).toHaveTextContent("Reading document");
});

export const Cancelled = meta.story({ args: { status: ExtractionViewStatus.cancelled } });

Cancelled.test("Ends with a completed Cancelled step and no current step", async ({ canvas }) => {
  await expect(canvas.queryByRole("tab", { current: "step" })).not.toBeInTheDocument();
  const steps = canvas.getAllByRole("tab");
  await expect(steps).toHaveLength(4);
  for (const step of steps) {
    await expect(step).toHaveAttribute("data-state", "completed");
  }
  await expect(canvas.getByText("Cancelled")).toBeVisible();
});
