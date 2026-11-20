import { expect, fn, screen, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";
import type { TemplateActionFailure } from "~/features/templates/schemas/template-action-result";
import { fieldValuesBuilder, templateFormValuesBuilder } from "~/features/templates/utils/template.builder";
import { emptyTemplateFormValues } from "~/features/templates/utils/template-mapping";

import { TemplateEditor } from "./template-editor";

const DESCRIPTION_LABEL = /^Description \(optional\)$/;

/** An action that has not answered yet: on success the real action redirects and never answers. */
function neverAnswers() {
  return new Promise<TemplateActionFailure>(() => undefined);
}

function failure(overrides: Partial<TemplateActionFailure>): TemplateActionFailure {
  return { error: "Error", fieldErrors: {}, kind: "validation", success: false, ...overrides };
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
      templateFormValuesBuilder.one({
        overrides: {
          description: "",
          fields: [fieldValuesBuilder.one({ overrides: { key: "invoice_number" } })],
          name: "Invoice"
        }
      })
    );
  }
);

CreateInvoice.test("Cancel leads back to the list without saving", async ({ args, canvas }) => {
  await expect(canvas.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/forms");
  await expect(args.onSubmitAction).not.toHaveBeenCalled();
});

export const ThreeFields = meta.story({
  args: {
    initialValues: templateFormValuesBuilder.one({
      overrides: {
        fields: [
          fieldValuesBuilder.one({ overrides: { key: "invoice_number" } }),
          fieldValuesBuilder.one({ overrides: { key: "total", type: "number" } }),
          fieldValuesBuilder.one({ overrides: { key: "issued_on", type: "date" } })
        ]
      }
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
    initialValues: templateFormValuesBuilder.one({
      overrides: {
        fields: [
          fieldValuesBuilder.one({ overrides: { key: "total" } }),
          fieldValuesBuilder.one({ overrides: { key: "date" } }),
          fieldValuesBuilder.one({ overrides: { key: "total" } })
        ]
      }
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
    await expect(canvas.getByLabelText("Key of field 3")).toHaveFocus();
    await expect(args.onSubmitAction).not.toHaveBeenCalled();
  }
);

export const ChoiceWithoutValues = meta.story({
  args: {
    initialValues: templateFormValuesBuilder.one({
      overrides: { fields: [fieldValuesBuilder.one({ overrides: { key: "status" } })] }
    }),
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

const filled = templateFormValuesBuilder.one({
  overrides: {
    description: "Supplier invoices",
    fields: [
      fieldValuesBuilder.one({
        overrides: {
          description: "Number at the top right",
          key: "invoice_number",
          pattern: "^INV-[0-9]+$",
          required: true
        }
      }),
      fieldValuesBuilder.one({ overrides: { key: "total", maximum: "10000", minimum: "0.5", type: "number" } }),
      fieldValuesBuilder.one({ overrides: { allowedValues: "paid\nopen", key: "status", type: "choice" } })
    ],
    name: "VAT invoice"
  }
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
    initialValues: templateFormValuesBuilder.one({ overrides: { name: "Invoice" } }),
    mode: "edit",
    onDeleteAction: fn(neverAnswers),
    onSubmitAction: fn(async () =>
      failure({
        error: "The API rejected the form. Fix the marked fields.",
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

    await expect(await canvas.findByText("The API rejected the form. Fix the marked fields.")).toBeVisible();
    await expect(canvas.getByText("String should match pattern")).toBeVisible();
    await expect(canvas.getByLabelText("Name")).toHaveValue("Invoice");
    await expect(canvas.getByLabelText(DESCRIPTION_LABEL)).toHaveValue("Typed before the save");
    await expect(canvas.getByLabelText("Key of field 1")).toHaveValue("invoice_number");
  }
);

export const DeletedElsewhere = meta.story({
  args: {
    initialValues: templateFormValuesBuilder.one(),
    mode: "edit",
    onDeleteAction: fn(async () => failure({ error: "This form no longer exists.", kind: "not-found" })),
    onSubmitAction: fn(async () => failure({ error: "This form no longer exists.", kind: "not-found" }))
  }
});

DeletedElsewhere.test(
  "Saving reports the form as not found and links back to Forms (edge case)",
  async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save form" }));

    await expect(await canvas.findByText(/This form no longer exists/)).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Back to Forms" })).toHaveAttribute("href", "/forms");
  }
);

DeletedElsewhere.test("Deleting reports the form as not found (edge case)", async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
  await userEvent.click(await screen.findByRole("button", { name: "Delete form" }));

  await expect(await canvas.findByText(/This form no longer exists/)).toBeVisible();
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

ThreeFields.test(
  "Moving a row takes its key, type and values along and sends the rows in the new order (AC16)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Move field 1 down" }));

    await expect(canvas.getByLabelText("Key of field 1")).toHaveValue("total");
    await expect(canvas.getByRole("combobox", { name: "Type of field 1" })).toHaveTextContent("Number");
    await expect(canvas.getByLabelText("Key of field 2")).toHaveValue("invoice_number");
    await expect(canvas.getByRole("combobox", { name: "Type of field 2" })).toHaveTextContent("Text");

    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await expect(args.onSubmitAction).toHaveBeenCalledWith(
      templateFormValuesBuilder.one({
        overrides: {
          fields: [
            fieldValuesBuilder.one({ overrides: { key: "total", type: "number" } }),
            fieldValuesBuilder.one({ overrides: { key: "invoice_number" } }),
            fieldValuesBuilder.one({ overrides: { key: "issued_on", type: "date" } })
          ]
        }
      })
    );
  }
);

ThreeFields.test(
  "Gives each drag handle an accessible name, and the rows keep stable ids (WCAG 4.1.2)",
  async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Reorder field 1" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Reorder field 3" })).toBeVisible();

    const rows = canvas.getAllByTestId(/^field-row-/);
    const ids = rows.map((row) => row.getAttribute("data-value"));
    await expect(new Set(ids).size).toBe(3);
    for (const row of rows) {
      await expect(row.getAttribute("aria-describedby") ?? "").not.toContain("DndDescribedBy");
    }
  }
);

ThreeFields.test("Cannot move the first row up or the last row down (AC16)", async ({ canvas }) => {
  await expect(canvas.getByRole("button", { name: "Move field 1 up" })).toBeDisabled();
  await expect(canvas.getByRole("button", { name: "Move field 3 down" })).toBeDisabled();
  await expect(canvas.getByRole("button", { name: "Move field 2 up" })).toBeEnabled();
});

ThreeFields.test(
  "Removing every row brings back the empty state and an empty preview, and the form is refused (AC16, AC13)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove field 1" }));
    await userEvent.click(canvas.getByRole("button", { name: "Remove field 1" }));
    await userEvent.click(canvas.getByRole("button", { name: "Remove field 1" }));

    await expect(canvas.getByText("No fields yet")).toBeVisible();
    await expect(canvas.getByLabelText("Preview of the API response")).toHaveTextContent("{ }");

    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));
    await expect(await canvas.findByText("Add at least one field")).toBeVisible();
    await expect(args.onSubmitAction).not.toHaveBeenCalled();
  }
);

ThreeFields.test(
  "Removing a row keeps the typed values of the rows that stay (AC16)",
  async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove field 2" }));

    await expect(canvas.getByLabelText("Key of field 1")).toHaveValue("invoice_number");
    await expect(canvas.getByLabelText("Key of field 2")).toHaveValue("issued_on");
    await expect(canvas.getByRole("combobox", { name: "Type of field 2" })).toHaveTextContent("Date");
  }
);

CreateEmpty.test(
  "Points at the name input itself when the name is only spaces (AC13)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Name"), "   ");
    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await expect(await canvas.findByText("Enter a name for the form")).toBeVisible();
    await expect(canvas.getByLabelText("Name")).toBeInvalid();
    await expect(canvas.getByLabelText(DESCRIPTION_LABEL)).toBeValid();
    await expect(args.onSubmitAction).not.toHaveBeenCalled();
  }
);

CreateEmpty.test(
  "Ties the message to the name input for a screen reader (stricter reading of AC13)",
  async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await expect(await canvas.findByText("Enter a name for the form")).toBeVisible();
    await expect(canvas.getByLabelText("Name")).toHaveAccessibleDescription(/Enter a name for the form/);
  }
);

DuplicateKeys.test("Marks only the repeated key, not the first use of it (AC14)", async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

  await expect(await canvas.findByText("This key is already used by another field")).toBeVisible();
  await expect(canvas.getAllByText("This key is already used by another field")).toHaveLength(1);
  await expect(canvas.getByLabelText("Key of field 3")).toBeInvalid();
  await expect(canvas.getByLabelText("Key of field 1")).toBeValid();
  await expect(canvas.getByLabelText("Key of field 2")).toBeValid();
});

DuplicateKeys.test(
  "Lets the form through once the duplicate is renamed (AC14)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));
    await expect(await canvas.findByText("This key is already used by another field")).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Key of field 3"), "_2");
    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await waitFor(() => expect(args.onSubmitAction).toHaveBeenCalledOnce());
    await expect(canvas.queryByText("This key is already used by another field")).not.toBeInTheDocument();
  }
);

ChoiceWithoutValues.test(
  "Marks the allowed values of that field and no other input (AC15)",
  async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Type of field 1" }));
    await userEvent.click(await screen.findByRole("option", { name: "Choice" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Create form" }));

    await expect(await canvas.findByText("Add at least one allowed value")).toBeVisible();
    await expect(canvas.getByLabelText("Allowed values of field 1")).toBeInvalid();
    await expect(canvas.getByLabelText("Key of field 1")).toBeValid();
  }
);

ChoiceWithoutValues.test(
  "Sends the values once they are typed, one per line (AC15)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Type of field 1" }));
    await userEvent.click(await screen.findByRole("option", { name: "Choice" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.type(await canvas.findByLabelText("Allowed values of field 1"), "open{Enter}closed");
    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await waitFor(() => expect(args.onSubmitAction).toHaveBeenCalledOnce());
    await expect(args.onSubmitAction).toHaveBeenCalledWith(
      templateFormValuesBuilder.one({
        overrides: {
          fields: [
            fieldValuesBuilder.one({ overrides: { allowedValues: "open\nclosed", key: "status", type: "choice" } })
          ]
        }
      })
    );
  }
);

SaveRejected.test("Marks the key the API rejected as invalid (AC19)", async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Save form" }));

  await expect(await canvas.findByText("String should match pattern")).toBeVisible();
  await expect(canvas.getByLabelText("Key of field 1")).toBeInvalid();
  await expect(canvas.getByLabelText("Name")).toBeValid();
});

const rejectedByTheApi = failure({
  error: "The API rejected the form. Fix the marked fields.",
  fieldErrors: {
    "fields.0.maximum": "Input should be a valid number",
    name: "String should have at most 100 characters"
  }
});

export const RangeRejected = meta.story({
  args: {
    initialValues: templateFormValuesBuilder.one({
      overrides: {
        fields: [fieldValuesBuilder.one({ overrides: { key: "total", type: "number" } })],
        name: "Invoice"
      }
    }),
    mode: "create",
    onSubmitAction: fn(async () => rejectedByTheApi)
  }
});

RangeRejected.test(
  "Opens the Advanced part of a row to show the API's message about its range, and keeps the input (AC19)",
  async ({ canvas, userEvent }) => {
    await expect(canvas.queryByLabelText("Maximum of field 1")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await expect(await canvas.findByText("Input should be a valid number")).toBeVisible();
    await expect(canvas.getByLabelText("Maximum of field 1")).toBeInvalid();
    await expect(canvas.getByText("String should have at most 100 characters")).toBeVisible();
    await expect(canvas.getByLabelText("Name")).toHaveValue("Invoice");
    await expect(canvas.getByLabelText("Key of field 1")).toHaveValue("total");
  }
);

export const Saving = meta.story({
  args: {
    initialValues: templateFormValuesBuilder.one(),
    mode: "edit",
    onDeleteAction: fn(neverAnswers),
    onSubmitAction: fn(neverAnswers)
  }
});

Saving.test(
  "Sends the form once, even when Enter is pressed while it is saving (AC12, AC18)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save form" }));
    await waitFor(() => expect(args.onSubmitAction).toHaveBeenCalledOnce());

    await userEvent.type(canvas.getByLabelText("Name"), "{Enter}");

    await expect(args.onSubmitAction).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("button", { name: /Save form/ })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Delete" })).toBeDisabled();
  }
);

Saving.test("Cancel leads back to the list and calls no action (edge case)", async ({ args, canvas }) => {
  await expect(canvas.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/forms");
  await expect(args.onSubmitAction).not.toHaveBeenCalled();
  await expect(args.mode === "edit" && args.onDeleteAction).not.toHaveBeenCalled();
});

export const FiftyFields = meta.story({
  args: {
    initialValues: templateFormValuesBuilder.one({
      overrides: {
        fields: fieldValuesBuilder.many(50).map((field, index) => ({ ...field, key: `field_${index}` }))
      }
    }),
    mode: "create",
    onSubmitAction: fn(neverAnswers)
  }
});

FiftyFields.test("Stops adding rows at the API's limit of 50 fields (edge case)", async ({ canvas }) => {
  await expect(canvas.getByRole("button", { name: "Add field" })).toBeDisabled();
  await expect(canvas.getByText(/^50 fields/)).toBeVisible();
});

export const TypeChanges = meta.story({
  args: {
    initialValues: filled,
    mode: "edit",
    onDeleteAction: fn(neverAnswers),
    onSubmitAction: fn(neverAnswers)
  }
});

TypeChanges.test(
  "Drops the range, pattern and allowed values a row can no longer have when its type changes (edge case)",
  async ({ args, canvas, userEvent }) => {
    for (const [field, option] of [
      [2, "Yes / no (boolean)"],
      [3, "Text"],
      [1, "Number"]
    ] as const) {
      await userEvent.click(canvas.getByRole("combobox", { name: `Type of field ${field}` }));
      await userEvent.click(await screen.findByRole("option", { name: option }));
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    }

    await userEvent.click(canvas.getByRole("button", { name: "Save form" }));

    await waitFor(() => expect(args.onSubmitAction).toHaveBeenCalledOnce());
    await expect(args.onSubmitAction).toHaveBeenCalledWith({
      ...filled,
      fields: [
        { ...filled.fields[0], pattern: "", type: "number" },
        { ...filled.fields[1], maximum: "", minimum: "", type: "boolean" },
        { ...filled.fields[2], allowedValues: "", type: "text" }
      ]
    });
  }
);

const longKey = `a${"b".repeat(63)}`;

export const PhoneWidthLongText = meta.story({
  args: {
    initialValues: templateFormValuesBuilder.one({
      overrides: {
        description: "d".repeat(300),
        fields: [
          fieldValuesBuilder.one({
            overrides: {
              allowedValues: `${"v".repeat(100)}\nshort`,
              description: "x".repeat(300),
              key: longKey,
              type: "choice"
            }
          }),
          fieldValuesBuilder.one({
            overrides: { key: `${longKey.slice(0, 63)}c`, maximum: "123456789012345678901234567890", type: "number" }
          })
        ],
        name: "N".repeat(100)
      }
    }),
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

PhoneWidthLongText.test(
  "Keeps long keys and values and the buttons inside the screen without sideways scrolling (AC24)",
  async ({ canvas }) => {
    const phone = canvas.getByTestId("phone");
    const right = phone.getBoundingClientRect().right;

    await expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
    for (const name of ["Delete", "Cancel", "Save form"]) {
      const element = canvas.getByRole(name === "Cancel" ? "link" : "button", { name });
      await expect(element.getBoundingClientRect().right).toBeLessThanOrEqual(right);
    }
    await expect(canvas.getByLabelText("Key of field 1").getBoundingClientRect().right).toBeLessThanOrEqual(right);
    await expect(canvas.getByLabelText("Maximum of field 2").getBoundingClientRect().right).toBeLessThanOrEqual(right);
  }
);

export const TypedFromScratch = meta.story({
  args: {
    initialValues: emptyTemplateFormValues(),
    mode: "create",
    onSubmitAction: fn(neverAnswers)
  }
});

TypedFromScratch.test(
  "Shows the message of a duplicate key at once when Create form is clicked, with no further edit (AC14)",
  async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Name", { exact: true }), "Invoice");
    await userEvent.click(canvas.getByRole("button", { name: "Add first field" }));
    await userEvent.type(await canvas.findByLabelText("Key of field 1"), "total");
    await userEvent.click(canvas.getByRole("button", { name: "Add field" }));
    await userEvent.type(await canvas.findByLabelText("Key of field 2"), "total");

    await userEvent.click(canvas.getByRole("button", { name: "Create form" }));

    await expect(await canvas.findByText("This key is already used by another field")).toBeVisible();
    await expect(args.onSubmitAction).not.toHaveBeenCalled();
  }
);
