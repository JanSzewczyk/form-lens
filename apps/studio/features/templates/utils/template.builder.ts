import type { FieldSpec, TemplateResponse } from "@form-lens/api-client";
import { FieldType } from "@form-lens/api-client";
import { build, type Overrides, oneOf, sequence } from "mimicry-js";

import {
  TemplateFieldType,
  type TemplateFieldValues,
  type TemplateFormValues
} from "~/features/templates/schemas/template-form-schema";

type BuildConfig<T> = { overrides?: Overrides<T> };

/**
 * The part of a mimicry-js builder these tests use. Typing the builders with it fixes the result type: the library's
 * own `one<Result>` takes its `Result` from where the call sits, so in a story's `args` it came out as `T | undefined`.
 */
type Builder<T> = {
  many(count: number, config?: BuildConfig<T>): Array<T>;
  one(config?: BuildConfig<T>): T;
};

/** A new, untouched field row of the editor: what the Add field button appends. Tests name what they assert on. */
export const fieldValuesBuilder: Builder<TemplateFieldValues> = build<TemplateFieldValues>({
  fields: {
    allowedValues: "",
    description: "",
    key: "",
    maximum: "",
    minimum: "",
    pattern: "",
    required: false,
    type: TemplateFieldType.text
  }
});

/** A valid form: the "Invoice" template with one text field `invoice_number`. */
export const templateFormValuesBuilder: Builder<TemplateFormValues> = build<TemplateFormValues>({
  fields: {
    description: "",
    fields: () => [fieldValuesBuilder.one({ overrides: { key: "invoice_number" } })],
    name: "Invoice"
  }
});

/** A field as the API stores it. */
export const fieldSpecBuilder: Builder<FieldSpec> = build<FieldSpec>({
  fields: {
    allowed_values: null,
    description: "",
    maximum: null,
    minimum: null,
    name: sequence((counter) => `field_${counter}`),
    pattern: null,
    required: false,
    type: oneOf(FieldType.text, FieldType.number, FieldType.date)
  }
});

/** A template as the API returns it; a sequence gives every one its own id and name. */
export const templateResponseBuilder: Builder<TemplateResponse> = build<TemplateResponse>({
  fields: {
    created_at: "2026-01-02T08:00:00Z",
    description: "A form.",
    fields: () => [fieldSpecBuilder.one()],
    id: sequence((counter) => `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`),
    json_schema: {},
    last_used_at: null,
    name: sequence((counter) => `Form ${counter}`),
    updated_at: "2026-01-02T08:00:00Z",
    version: 1
  }
});
