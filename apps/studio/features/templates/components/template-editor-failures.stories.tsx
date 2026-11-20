import { expect, fn, screen, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";
import type { TemplateActionFailure } from "~/features/templates/schemas/template-action-result";
import { templateFormValuesBuilder } from "~/features/templates/utils/template.builder";

import { TemplateEditor } from "./template-editor";

// Kept apart from template-editor.stories.tsx on purpose: an action that never answers there leaves React's shared
// async-transition scope open, so a later story of the same file never sees `isPending` return to false.

const DESCRIPTION_LABEL = /^Description \(optional\)$/;

function unavailable(): Promise<TemplateActionFailure> {
  return Promise.resolve({
    error: "The API is unavailable.",
    fieldErrors: {},
    kind: "unavailable",
    success: false
  });
}

const meta = preview.meta({
  component: TemplateEditor,
  parameters: { layout: "padded" },
  title: "Templates/Template editor failures"
});

export const ApiUnavailable = meta.story({
  args: {
    initialValues: templateFormValuesBuilder.one({ overrides: { description: "Typed by the user" } }),
    mode: "edit",
    onDeleteAction: fn(unavailable),
    onSubmitAction: fn(unavailable)
  }
});

ApiUnavailable.test(
  "Says the API is unavailable, keeps the input, and does not send the user away (AC19)",
  async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save form" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent("The API is unavailable.");
    await expect(canvas.queryByRole("link", { name: "Back to Forms" })).not.toBeInTheDocument();
    await expect(canvas.getByLabelText(DESCRIPTION_LABEL)).toHaveValue("Typed by the user");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Save form" })).toBeEnabled());
  }
);

ApiUnavailable.test("Can be sent again after a failed save (AC19)", async ({ args, canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Save form" }));
  await expect(await canvas.findByRole("alert")).toBeVisible();

  await userEvent.click(await canvas.findByRole("button", { name: "Save form" }));

  await waitFor(() => expect(args.onSubmitAction).toHaveBeenCalledTimes(2));
});

ApiUnavailable.test("Lets the user try again after a failed delete (AC20)", async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
  await userEvent.click(await screen.findByRole("button", { name: "Delete form" }));

  await expect(await canvas.findByRole("alert")).toHaveTextContent("The API is unavailable.");
  await waitFor(() => expect(canvas.getByRole("button", { name: "Delete" })).toBeEnabled());
  await expect(canvas.getByLabelText("Name")).toHaveValue("Invoice");
});

function rejectedByApi(): Promise<TemplateActionFailure> {
  return Promise.resolve({
    error: "The API rejected the form. Check the template.",
    fieldErrors: {},
    kind: "validation",
    success: false
  });
}

export const ApiRejectsThenClientRefuses = meta.story({
  args: {
    initialValues: templateFormValuesBuilder.one(),
    mode: "edit",
    onDeleteAction: fn(rejectedByApi),
    onSubmitAction: fn(rejectedByApi)
  }
});

ApiRejectsThenClientRefuses.test(
  "Drops the message of the API when the next submit is refused in the browser (AC19)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save form" }));
    await expect(await canvas.findByText("The API rejected the form. Check the template.")).toBeVisible();

    await userEvent.clear(canvas.getByLabelText("Name"));
    await userEvent.click(await canvas.findByRole("button", { name: "Save form" }));

    await expect(await canvas.findByText("Enter a name for the form")).toBeVisible();
    await expect(canvas.queryByText("The API rejected the form. Check the template.")).not.toBeInTheDocument();
    await expect(args.onSubmitAction).toHaveBeenCalledTimes(1);
  }
);

ApiRejectsThenClientRefuses.test(
  "Announces the refusal made in the browser, with the focus on the first invalid input (AC13)",
  async ({ canvas, userEvent }) => {
    await userEvent.clear(canvas.getByLabelText("Name"));
    await userEvent.click(canvas.getByRole("button", { name: "Save form" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent("Enter a name for the form");
    await expect(canvas.getByLabelText("Name")).toHaveFocus();
  }
);
