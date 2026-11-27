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
  /** Present when the extraction failed; `message` is fixed text from the API and never holds text of the document. */
  error: z.object({ message: z.string(), reason: z.string() }).nullish(),
  fields: z.array(z.object({ name: z.string(), required: z.boolean(), type: z.string() })),
  filename: z.string().nullable(),
  id: z.string(),
  /** The required fields the document does not show; empty until the extraction completes. */
  missing_required: z.array(z.string()).optional(),
  /** One value per field, `null` where the document shows none; present once the extraction completed. */
  result: z.record(z.string(), z.unknown()).nullish(),
  status: z.enum(ExtractionViewStatus),
  template_id: z.string(),
  template_name: z.string()
});

export type ExtractionView = z.infer<typeof extractionViewSchema>;

export const CancelFailureKind = {
  /** The extraction ended before the cancel reached it; `extraction` is its final state. */
  finished: "finished",
  /** The extraction no longer exists, for example its result expired. */
  notFound: "not-found",
  /** The API did not answer, or answered something unexpected. */
  unavailable: "unavailable"
} as const;

export type CancelFailureKind = (typeof CancelFailureKind)[keyof typeof CancelFailureKind];

/** What `cancelExtraction` returns: the cancelled extraction, or why it was not cancelled. */
const cancelResultSchema = z.union([
  z.object({ extraction: extractionViewSchema, success: z.literal(true) }),
  z.object({
    error: z.string(),
    extraction: extractionViewSchema,
    kind: z.literal(CancelFailureKind.finished),
    success: z.literal(false)
  }),
  z.object({
    error: z.string(),
    kind: z.enum([CancelFailureKind.notFound, CancelFailureKind.unavailable]),
    success: z.literal(false)
  })
]);

export type CancelResult = z.infer<typeof cancelResultSchema>;
