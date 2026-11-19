import { expect, fn, screen, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";
import type { TemplateActionFailure } from "~/features/templates/schemas/template-action-result";
import { fieldValues, templateFormValues } from "~/features/templates/utils/template-fixtures";
import { emptyTemplateFormValues } from "~/features/templates/utils/template-mapping";

import { TemplateEditor } from "./template-editor";

const DESCRIPTION_LABEL = /^Description \(optional\)$/;

/** An action that has not answered yet: on success the real action redirects and never answers. */
function neverAnswers() {
  return new Promise<TemplateActionFailure>(() => undefined);
}

function failure(overrides: Partial<TemplateActionFailure>): TemplateActionFailure {
  return { error: "Błąd", fieldErrors: {}, kind: "validation", success: false, ...overrides };
}

const meta = preview.meta({
  component: TemplateEditor,
  parameters: { layout: "padded" },
  title: "Templates/Template editor"
});

export const CreateEmpty = meta.story({
  args: {
    initialValues: emptyTemplateFormValues(),
    mode: "create",
    onSubmitAction: fn(neverAnswers)
  }
});

CreateEmpty.test("Shows the empty state, an empty preview and no delete button", async ({ canvas }) => {
  await expect(canvas.getByText("No fields yet")).toBeVisible();
  await expect(canvas.getByRole("button", { name: "Add first field" })).toBeVisible();
  await expect(canvas.getByLabelText("Preview of the API response")).toHaveTextContent("{ }");
  await expect(canvas.getByRole("button", { name: "Create form" })).toBeVisible();
  await expect(canvas.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
});

CreateEmpty.test(
  "Refuses an empty name and no fields and points at both (AC13)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await expect(await canvas.findByText("Enter a name for the form")).toBeVisible();
    await expect(canvas.getByText("Add at least one field")).toBeVisible();
    await expect(args.onSubmitAction).not.toHaveBeenCalled();
  }
);

CreateEmpty.test("Adds a first field and shows its key in the preview (AC16)", async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Add first field" }));
  await userEvent.type(await canvas.findByLabelText("Key of field 1"), "invoice_number");

  await expect(canvas.getByLabelText("Preview of the API response")).toHaveTextContent('"invoice_number": "text"');
  await expect(canvas.queryByText("No fields yet")).not.toBeInTheDocument();
});

export const CreateInvoice = meta.story({
  args: {
    initialValues: emptyTemplateFormValues(),
    mode: "create",
    onSubmitAction: fn(neverAnswers)
  }
});

CreateInvoice.test(
  "Sends the Invoice form with its text field to the create action (AC12)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Name"), "Invoice");
    await userEvent.click(canvas.getByRole("button", { name: "Add first field" }));
    await userEvent.type(await canvas.findByLabelText("Key of field 1"), "invoice_number");
    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await expect(args.onSubmitAction).toHaveBeenCalledWith(
      templateFormValues({ description: "", fields: [fieldValues({ key: "invoice_number" })], name: "Invoice" })
    );
  }
);

CreateInvoice.test("Cancel leads back to the list without saving", async ({ args, canvas }) => {
  await expect(canvas.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/forms");
  await expect(args.onSubmitAction).not.toHaveBeenCalled();
});

export const ThreeFields = meta.story({
  args: {
    initialValues: templateFormValues({
      fields: [
        fieldValues({ key: "invoice_number" }),
        fieldValues({ key: "total", type: "number" }),
        fieldValues({ key: "issued_on", type: "date" })
      ]
    }),
    mode: "create",
    onSubmitAction: fn(neverAnswers)
  }
});

ThreeFields.test(
  "Reordering, removing and adding fields keeps the preview in the order of the rows (AC16)",
  async ({ canvas, step, userEvent }) => {
    const preview = canvas.getByLabelText("Preview of the API response");

    await step("the preview lists the keys in order with their types", async () => {
      await expect(preview).toHaveTextContent('{ "invoice_number": "text", "total": "number", "issued_on": "date" }');
    });

    await step("moving a field up changes the order", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Move field 3 up" }));
      await expect(preview).toHaveTextContent('{ "invoice_number": "text", "issued_on": "date", "total": "number" }');
    });

    await step("removing a field drops its key", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove field 1" }));
      await expect(preview).toHaveTextContent('{ "issued_on": "date", "total": "number" }');
    });

    await step("a new field is added at the end", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add field" }));
      await userEvent.type(await canvas.findByLabelText("Key of field 3"), "paid");
      await expect(preview).toHaveTextContent('{ "issued_on": "date", "total": "number", "paid": "text" }');
    });
  }
);

export const DuplicateKeys = meta.story({
  args: {
    initialValues: templateFormValues({
      fields: [fieldValues({ key: "total" }), fieldValues({ key: "date" }), fieldValues({ key: "total" })]
    }),
    mode: "create",
    onSubmitAction: fn(neverAnswers)
  }
});

DuplicateKeys.test(
  "Refuses two fields with the same key and names the duplicate (AC14)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await expect(await canvas.findByText("This key is already used by another field")).toBeVisible();
    await expect(args.onSubmitAction).not.toHaveBeenCalled();
  }
);

export const ChoiceWithoutValues = meta.story({
  args: {
    initialValues: templateFormValues({ fields: [fieldValues({ key: "status" })] }),
    mode: "create",
    onSubmitAction: fn(neverAnswers)
  }
});

ChoiceWithoutValues.test(
  "Refuses a choice field with no allowed values and points at that field (AC15)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Type of field 1" }));
    await userEvent.click(await screen.findByRole("option", { name: "Choice" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Create form" }));

    await expect(await canvas.findByText("Add at least one allowed value")).toBeVisible();
    await expect(args.onSubmitAction).not.toHaveBeenCalled();
  }
);

const filled = templateFormValues({
  description: "Supplier invoices",
  fields: [
    fieldValues({
      description: "Number at the top right",
      key: "invoice_number",
      pattern: "^INV-[0-9]+$",
      required: true
    }),
    fieldValues({ key: "total", maximum: "10000", minimum: "0.5", type: "number" }),
    fieldValues({ allowedValues: "paid\nopen", key: "status", type: "choice" })
  ],
  name: "VAT invoice"
});

/** The delete action of the edit stories; `args` is a union of both modes and has no `onDeleteAction` on its create side. */
const deleteAction = fn(neverAnswers);

export const EditFilled = meta.story({
  args: {
    initialValues: filled,
    mode: "edit",
    onDeleteAction: deleteAction,
    onSubmitAction: fn(neverAnswers)
  }
});

EditFilled.test("Shows the name, description and every property of the fields (AC17)", async ({ canvas }) => {
  await expect(canvas.getByLabelText("Name")).toHaveValue(filled.name);
  await expect(canvas.getByLabelText(DESCRIPTION_LABEL)).toHaveValue(filled.description);
  await expect(canvas.getByLabelText("Key of field 1")).toHaveValue("invoice_number");
  await expect(canvas.getByLabelText("Description of field 1")).toHaveValue("Number at the top right");
  await expect(canvas.getByRole("switch", { name: "Field 1 is required" })).toBeChecked();
  await expect(canvas.getByRole("switch", { name: "Field 2 is required" })).not.toBeChecked();
  await expect(canvas.getByLabelText("Pattern of field 1")).toHaveValue("^INV-[0-9]+$");
  await expect(canvas.getByLabelText("Minimum of field 2")).toHaveValue("0.5");
  await expect(canvas.getByLabelText("Maximum of field 2")).toHaveValue("10000");
  await expect(canvas.getByLabelText("Allowed values of field 3")).toHaveValue("paid\nopen");
  await expect(canvas.getByRole("combobox", { name: "Type of field 2" })).toHaveTextContent("Number");
  await expect(canvas.getByRole("button", { name: "Save form" })).toBeVisible();
});

EditFilled.test("Sends the changed values to the update action (AC18)", async ({ args, canvas, userEvent }) => {
  await userEvent.clear(canvas.getByLabelText("Name"));
  await userEvent.type(canvas.getByLabelText("Name"), "VAT invoice 2");
  await userEvent.click(canvas.getByRole("button", { name: "Save form" }));

  await expect(args.onSubmitAction).toHaveBeenCalledWith({ ...filled, name: "VAT invoice 2" });
});

EditFilled.test("Cancelling the delete dialog changes nothing (AC20)", async ({ args, canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog");
  await expect(dialog).toHaveTextContent("VAT invoice");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  await expect(deleteAction).not.toHaveBeenCalled();
  await expect(canvas.getByLabelText("Name")).toHaveValue(filled.name);
});

EditFilled.test("Confirming the delete dialog calls the delete action (AC20)", async ({ args, canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
  await userEvent.click(await screen.findByRole("button", { name: "Delete form" }));

  await expect(deleteAction).toHaveBeenCalledOnce();
});

export const SaveRejected = meta.story({
  args: {
    initialValues: templateFormValues({ name: "Invoice" }),
    mode: "edit",
    onDeleteAction: fn(neverAnswers),
    onSubmitAction: fn(async () =>
      failure({
        error: "Interfejs API odrzucił formularz. Popraw zaznaczone pola.",
        fieldErrors: { "fields.0.key": "String should match pattern" }
      })
    )
  }
});

SaveRejected.test(
  "Shows the API's message next to the field and keeps the entered data (AC19)",
  async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText(DESCRIPTION_LABEL), "Typed before the save");
    await userEvent.click(canvas.getByRole("button", { name: "Save form" }));

    await expect(await canvas.findByText("Interfejs API odrzucił formularz. Popraw zaznaczone pola.")).toBeVisible();
    await expect(canvas.getByText("String should match pattern")).toBeVisible();
    await expect(canvas.getByLabelText("Name")).toHaveValue("Invoice");
    await expect(canvas.getByLabelText(DESCRIPTION_LABEL)).toHaveValue("Typed before the save");
    await expect(canvas.getByLabelText("Key of field 1")).toHaveValue("invoice_number");
  }
);

export const DeletedElsewhere = meta.story({
  args: {
    initialValues: templateFormValues(),
    mode: "edit",
    onDeleteAction: fn(async () => failure({ error: "Ten formularz już nie istnieje.", kind: "not-found" })),
    onSubmitAction: fn(async () => failure({ error: "Ten formularz już nie istnieje.", kind: "not-found" }))
  }
});

DeletedElsewhere.test(
  "Saving reports the form as not found and links back to Forms (edge case)",
  async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save form" }));

    await expect(await canvas.findByText(/Ten formularz już nie istnieje/)).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Back to Forms" })).toHaveAttribute("href", "/forms");
  }
);

DeletedElsewhere.test("Deleting reports the form as not found (edge case)", async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
  await userEvent.click(await screen.findByRole("button", { name: "Delete form" }));

  await expect(await canvas.findByText(/Ten formularz już nie istnieje/)).toBeVisible();
});

export const PhoneWidth = meta.story({
  args: {
    initialValues: filled,
    mode: "edit",
    onDeleteAction: fn(neverAnswers),
    onSubmitAction: fn(neverAnswers)
  },
  decorators: [
    (Story) => (
      <div data-testid="phone" style={{ width: 375 }}>
        <Story />
      </div>
    )
  ]
});

PhoneWidth.test("Stacks the parts of a field row and does not scroll sideways (AC24)", async ({ canvas }) => {
  const phone = canvas.getByTestId("phone");
  const key = canvas.getByLabelText("Key of field 1").getBoundingClientRect();
  const description = canvas.getByLabelText("Description of field 1").getBoundingClientRect();
  const type = canvas.getByRole("combobox", { name: "Type of field 1" }).getBoundingClientRect();

  await expect(description.top).toBeGreaterThanOrEqual(key.bottom);
  await expect(type.top).toBeGreaterThanOrEqual(description.bottom);
  await expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
});
