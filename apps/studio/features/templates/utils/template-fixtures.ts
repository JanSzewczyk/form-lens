import type { TemplateFieldValues, TemplateFormValues } from "~/features/templates/schemas/template-form-schema";
import { emptyFieldValues } from "~/features/templates/utils/template-mapping";

/** A typed field with the given overrides; tests and stories name only what they assert on. */
export function fieldValues(overrides: Partial<TemplateFieldValues> = {}): TemplateFieldValues {
  return { ...emptyFieldValues(), ...overrides };
}

/** A valid form: the "Invoice" template with one text field `invoice_number`. */
export function templateFormValues(overrides: Partial<TemplateFormValues> = {}): TemplateFormValues {
  return {
    description: "",
    fields: [fieldValues({ key: "invoice_number" })],
    name: "Invoice",
    ...overrides
  };
}
