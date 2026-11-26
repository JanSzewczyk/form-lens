import { z } from "zod";

export const SubmitFailureKind = {
  /** The API's queue is full; the message says when to try again. */
  busy: "busy",
  /** The file was refused (by the Studio's own check or by the API): the message belongs at the drop zone. */
  file: "file",
  /** The selected form no longer exists. */
  formGone: "form-gone",
  /** The API did not answer, or answered something unexpected. */
  unavailable: "unavailable"
} as const;

export type SubmitFailureKind = (typeof SubmitFailureKind)[keyof typeof SubmitFailureKind];

/**
 * What `submitExtraction` returns. Success never comes back as a value: the action redirects to the status page, so
 * the only answer the form receives is a failure, with the form and the file still chosen in the browser.
 */
export const submitFailureSchema = z.object({
  error: z.string(),
  kind: z.enum(SubmitFailureKind),
  success: z.literal(false)
});

export type SubmitFailure = z.infer<typeof submitFailureSchema>;
