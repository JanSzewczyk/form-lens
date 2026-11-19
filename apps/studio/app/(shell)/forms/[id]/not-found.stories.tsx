import { expect } from "storybook/test";
import preview from "~/.storybook/preview";
import FormNotFound from "~/app/(shell)/forms/[id]/not-found";

const meta = preview.meta({
  component: FormNotFound,
  parameters: { layout: "padded" },
  title: "Templates/Form not found"
});

export const NotFound = meta.story({});

NotFound.test("Says the form does not exist and links back to Forms (AC21)", async ({ canvas }) => {
  await expect(canvas.getByText("Form not found")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Back to Forms" })).toHaveAttribute("href", "/forms");
});
