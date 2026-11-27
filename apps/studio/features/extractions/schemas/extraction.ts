import type { ExtractionStatus as ApiExtractionStatus } from "@form-lens/api-client";
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

/**
 * Where an extraction is in its life, `cancelled` included. A copy of the API's `ExtractionStatus`, because client code
 * may not import the API client; `SameAsApiStatus` below fails the type-check when the two drift apart.
 */
export const ExtractionViewStatus = {
  cancelled: "cancelled",
  completed: "completed",
  failed: "failed",
  pending: "pending",
  running: "running"
} as const;

export type ExtractionViewStatus = (typeof ExtractionViewStatus)[keyof typeof ExtractionViewStatus];

type SameAsApiStatus<T extends ApiExtractionStatus> = [ApiExtractionStatus] extends [T] ? true : never;
const STATUSES_MATCH_THE_API: SameAsApiStatus<ExtractionViewStatus> = true;
void STATUSES_MATCH_THE_API;

/** The statuses after which an extraction never changes again, so the status page stops asking. */
export const FINAL_STATUSES: ReadonlyArray<ExtractionViewStatus> = [
  ExtractionViewStatus.completed,
  ExtractionViewStatus.failed,
  ExtractionViewStatus.cancelled
];

/**
 * What the status page shows of an extraction, served by `GET /api/extractions/[id]`. `fields` is the form as it was
 * at the submit, so a later edit of the form does not change the Results panel.
 */
export const extractionViewSchema = z.object({
  created_at: z.string(),
  fields: z.array(z.object({ name: z.string(), required: z.boolean(), type: z.string() })),
  filename: z.string().nullable(),
  id: z.string(),
  status: z.enum(ExtractionViewStatus),
  template_id: z.string(),
  template_name: z.string()
});

export type ExtractionView = z.infer<typeof extractionViewSchema>;
