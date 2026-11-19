import { z } from "zod";

/** The six types of the API's `FieldType`, in the order the editor lists them. */
export const TemplateFieldType = {
  boolean: "boolean",
  choice: "choice",
  date: "date",
  integer: "integer",
  number: "number",
  text: "text"
} as const;

export type TemplateFieldType = (typeof TemplateFieldType)[keyof typeof TemplateFieldType];

export const TEMPLATE_NAME_MAX = 100;
export const TEMPLATE_DESCRIPTION_MAX = 300;
const FIELD_KEY_MAX = 64;
const FIELD_DESCRIPTION_MAX = 300;
const FIELDS_MIN = 1;
export const FIELDS_MAX = 50;
const ALLOWED_VALUES_MAX = 50;
const ALLOWED_VALUE_LENGTH_MAX = 100;
const PATTERN_MAX = 200;

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Allowed values are typed one per line; blank lines are ignored. */
export function parseAllowedValues(text: string): Array<string> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isNumeric(text: string): boolean {
  return text.trim() !== "" && Number.isFinite(Number(text));
}

const fieldSchema = z
  .object({
    allowedValues: z.string(),
    description: z.string().max(FIELD_DESCRIPTION_MAX, `At most ${FIELD_DESCRIPTION_MAX} characters`),
    key: z
      .string()
      .min(1, "Enter a key for this field")
      .max(FIELD_KEY_MAX, `At most ${FIELD_KEY_MAX} characters`)
      .regex(FIELD_KEY_PATTERN, "Use lower case letters, digits and _, starting with a letter"),
    maximum: z.string(),
    minimum: z.string(),
    pattern: z.string().max(PATTERN_MAX, `At most ${PATTERN_MAX} characters`),
    required: z.boolean(),
    type: z.enum(TemplateFieldType)
  })
  .superRefine((field, context) => {
    const isChoice = field.type === TemplateFieldType.choice;
    const values = parseAllowedValues(field.allowedValues);

    if (isChoice && values.length === 0) {
      context.addIssue({ code: "custom", message: "Add at least one allowed value", path: ["allowedValues"] });
    } else if (isChoice && values.length > ALLOWED_VALUES_MAX) {
      context.addIssue({
        code: "custom",
        message: `At most ${ALLOWED_VALUES_MAX} allowed values`,
        path: ["allowedValues"]
      });
    } else if (isChoice && values.some((value) => value.length > ALLOWED_VALUE_LENGTH_MAX)) {
      context.addIssue({
        code: "custom",
        message: `Each value has at most ${ALLOWED_VALUE_LENGTH_MAX} characters`,
        path: ["allowedValues"]
      });
    } else if (isChoice && new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "Allowed values must differ", path: ["allowedValues"] });
    } else if (!isChoice && values.length > 0) {
      context.addIssue({ code: "custom", message: "Only a choice field has allowed values", path: ["allowedValues"] });
    }

    const hasRange = field.type === TemplateFieldType.number || field.type === TemplateFieldType.integer;
    for (const bound of ["minimum", "maximum"] as const) {
      const text = field[bound];
      if (text.trim() === "") {
        continue;
      }
      if (!hasRange) {
        context.addIssue({ code: "custom", message: "Only a number or integer has a range", path: [bound] });
      } else if (!isNumeric(text)) {
        context.addIssue({ code: "custom", message: "Enter a number", path: [bound] });
      } else if (field.type === TemplateFieldType.integer && !Number.isInteger(Number(text))) {
        context.addIssue({ code: "custom", message: "Enter a whole number", path: [bound] });
      }
    }
    if (
      isNumeric(field.minimum) &&
      isNumeric(field.maximum) &&
      hasRange &&
      Number(field.minimum) > Number(field.maximum)
    ) {
      context.addIssue({ code: "custom", message: "The minimum is above the maximum", path: ["minimum"] });
    }

    if (field.pattern !== "" && field.type !== TemplateFieldType.text) {
      context.addIssue({ code: "custom", message: "Only a text field has a pattern", path: ["pattern"] });
    }
  });

export const templateFormSchema = z.object({
  description: z.string().max(TEMPLATE_DESCRIPTION_MAX, `At most ${TEMPLATE_DESCRIPTION_MAX} characters`),
  fields: z
    .array(fieldSchema)
    .min(FIELDS_MIN, "Add at least one field")
    .max(FIELDS_MAX, `At most ${FIELDS_MAX} fields`)
    .superRefine((fields, context) => {
      const firstIndexOfKey = new Map<string, number>();
      fields.forEach((field, index) => {
        if (field.key === "") {
          return;
        }
        if (firstIndexOfKey.has(field.key)) {
          context.addIssue({
            code: "custom",
            message: "This key is already used by another field",
            path: [index, "key"]
          });
        } else {
          firstIndexOfKey.set(field.key, index);
        }
      });
    }),
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for the form")
    .max(TEMPLATE_NAME_MAX, `At most ${TEMPLATE_NAME_MAX} characters`)
});

export type TemplateFormValues = z.infer<typeof templateFormSchema>;
export type TemplateFieldValues = TemplateFormValues["fields"][number];
