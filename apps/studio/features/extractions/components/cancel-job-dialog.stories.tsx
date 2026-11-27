import { expect, fn, screen, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";

import { CancelJobDialog } from "./cancel-job-dialog";

const meta = preview.meta({
  args: { onConfirm: fn() },
  component: CancelJobDialog,
  title: "Features/Extractions/Cancel Job Dialog"
});

export const Closed = meta.story({});

Closed.test("Asks for confirmation and cancels only when confirmed (AC30)", async ({ args, canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Cancel job" }));

  await expect(await screen.findByRole("alertdialog", { name: "Cancel this job?" })).toHaveTextContent(
    "FormLens stops reading the document and keeps no result."
  );
  await expect(args.onConfirm).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "Cancel the job" }));

  await expect(args.onConfirm).toHaveBeenCalledOnce();
});

Closed.test("Dismissing the confirmation closes it and changes nothing (AC30)", async ({ args, canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Cancel job" }));
  await userEvent.click(await screen.findByRole("button", { name: "Keep running" }));

  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  await expect(args.onConfirm).not.toHaveBeenCalled();
  await expect(canvas.getByRole("button", { name: "Cancel job" })).toBeEnabled();
});

export const Cancelling = meta.story({ args: { isCancelling: true } });

Cancelling.test("Cannot be opened again while a cancel is on its way", async ({ canvas }) => {
  await expect(canvas.getByRole("button", { name: /Cancel job/ })).toBeDisabled();
});
