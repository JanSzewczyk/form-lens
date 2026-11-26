import { expect, fn, screen, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";

import { DeleteTemplateDialog } from "./delete-template-dialog";

const meta = preview.meta({
  args: { onConfirm: fn(), templateName: "VAT invoice" },
  component: DeleteTemplateDialog,
  title: "Templates/Delete template dialog"
});

export const Closed = meta.story({});

Closed.test("Names the form and calls onConfirm only after Delete form (AC20)", async ({ args, canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
  await expect(await screen.findByRole("alertdialog")).toHaveTextContent("VAT invoice");
  await expect(args.onConfirm).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "Delete form" }));
  await expect(args.onConfirm).toHaveBeenCalledOnce();
});

Closed.test("Cancel closes the dialog without calling onConfirm (AC20)", async ({ args, canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
  await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  await expect(args.onConfirm).not.toHaveBeenCalled();
});

export const Disabled = meta.story({ args: { disabled: true } });

Disabled.test("Cannot be opened while an action is pending", async ({ canvas }) => {
  await expect(canvas.getByRole("button", { name: "Delete" })).toBeDisabled();
});
