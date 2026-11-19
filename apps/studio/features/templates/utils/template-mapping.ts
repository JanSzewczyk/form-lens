import type { FieldSpec, TemplateCreate, TemplateResponse } from "@form-lens/api-client";

import {
  parseAllowedValues,
  TemplateFieldType,
  type TemplateFieldValues,
  type TemplateFormValues
} from "~/features/templates/schemas/template-form-schema";

export function emptyFieldValues(): TemplateFieldValues {
  return {
    allowedValues: "",
    description: "",
    key: "",
    maximum: "",
    minimum: "",
    pattern: "",
    required: false,
    type: TemplateFieldType.text
  };
}

export function emptyTemplateFormValues(): TemplateFormValues {
  return { description: "", fields: [], name: "" };
}

function toFieldSpec(field: TemplateFieldValues): FieldSpec {
  const hasRange = field.type === TemplateFieldType.number || field.type === TemplateFieldType.integer;
  const pattern = field.pattern.trim();

  return {
    allowed_values: field.type === TemplateFieldType.choice ? parseAllowedValues(field.allowedValues) : null,
    description: field.description,
    maximum: hasRange && field.maximum.trim() !== "" ? Number(field.maximum) : null,
    minimum: hasRange && field.minimum.trim() !== "" ? Number(field.minimum) : null,
    name: field.key,
    pattern: field.type === TemplateFieldType.text && pattern !== "" ? pattern : null,
    required: field.required,
    type: field.type
  };
}

/** The body of `POST /v1/templates`; `PUT /v1/templates/{id}` takes the same shape. */
export function toTemplateBody(values: TemplateFormValues): TemplateCreate {
  return { description: values.description, fields: values.fields.map(toFieldSpec), name: values.name };
}

export function toFormValues(template: Pick<TemplateResponse, "description" | "fields" | "name">): TemplateFormValues {
  return {
    description: template.description,
    fields: template.fields.map((field) => ({
      allowedValues: (field.allowed_values ?? []).join("\n"),
      description: field.description ?? "",
      key: field.name,
      maximum: field.maximum == null ? "" : String(field.maximum),
      minimum: field.minimum == null ? "" : String(field.minimum),
      pattern: field.pattern ?? "",
      required: field.required ?? false,
      type: field.type
    })),
    name: template.name
  };
}

/** The shape of an extraction result: every key of the template, in its order, with the type of its value. */
export function buildResponsePreview(fields: ReadonlyArray<Pick<TemplateFieldValues, "key" | "type">>): string {
  const named = fields.filter((field) => field.key !== "");
  if (named.length === 0) {
    return "{ }";
  }
  const lines = named.map((field) => `  ${JSON.stringify(field.key)}: ${JSON.stringify(field.type)}`);
  return `{\n${lines.join(",\n")}\n}`;
}
