import { z } from "zod";

export const TemplateActionFailureKind = {
  notFound: "not-found",
  unavailable: "unavailable",
  validation: "validation"
} as const;

export type TemplateActionFailureKind = (typeof TemplateActionFailureKind)[keyof typeof TemplateActionFailureKind];

/**
 * What a template action returns. Success never comes back as a value: the action redirects, so the only answer
 * the form receives is a failure, with the input kept in the browser.
 */
export const templateActionFailureSchema = z.object({
  error: z.string(),
  /** Messages by form path, for example `name` or `fields.0.key`; a path of `fields` is the list as a whole. */
  fieldErrors: z.record(z.string(), z.string()),
  kind: z.enum(TemplateActionFailureKind),
  success: z.literal(false)
});

export type TemplateActionFailure = z.infer<typeof templateActionFailureSchema>;
