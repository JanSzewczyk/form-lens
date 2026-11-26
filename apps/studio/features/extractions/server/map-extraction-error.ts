import "server-only";

import { z } from "zod";

import { type SubmitFailure, SubmitFailureKind, submitFailureSchema } from "~/features/extractions/schemas/extraction";

const MESSAGE = {
  busy: "FormLens is busy reading other documents. Try again in a moment.",
  fileRefused: "The API did not accept this file.",
  formGone: "This form no longer exists. It may have been deleted elsewhere. Choose another form.",
  tooLarge: "The file is too large for the API.",
  unavailable: "The API is unavailable. Your form and file were kept, try again in a moment."
} as const;

/** The statuses with which the API refuses the file itself (empty, too large, unsupported type, unreadable request). */
const FILE_STATUSES: ReadonlyArray<number> = [400, 413, 415, 422];

const problemSchema = z.object({ detail: z.string().nullish() });

function failure(kind: SubmitFailureKind, error: string): SubmitFailure {
  return submitFailureSchema.parse({ error, kind, success: false });
}

/** `Retry-After` in whole seconds; 0, the HTTP-date form and anything unreadable give `undefined`. */
function retryAfterSeconds(headers: Headers): number | undefined {
  const value = headers.get("retry-after")?.trim() ?? "";
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * The user's view of an answer the API refused when a document was submitted. The API's `detail` is written for the
 * person who sent the file (for example "The file is empty."), so it is shown for a refused file; the raw problem is
 * logged by the caller.
 */
export function mapExtractionProblem(status: number, data: unknown, headers: Headers): SubmitFailure {
  if (FILE_STATUSES.includes(status)) {
    const parsed = problemSchema.safeParse(data);
    const detail = parsed.success ? parsed.data.detail : undefined;
    return failure(SubmitFailureKind.file, detail || (status === 413 ? MESSAGE.tooLarge : MESSAGE.fileRefused));
  }
  if (status === 404) {
    return failure(SubmitFailureKind.formGone, MESSAGE.formGone);
  }
  if (status === 503) {
    const seconds = retryAfterSeconds(headers);
    return failure(
      SubmitFailureKind.busy,
      seconds === undefined ? MESSAGE.busy : `FormLens is busy reading other documents. Try again in ${seconds} s.`
    );
  }
  return failure(SubmitFailureKind.unavailable, MESSAGE.unavailable);
}

/** The API did not answer at all (network error or timeout). */
export function mapExtractionUnreachable(): SubmitFailure {
  return failure(SubmitFailureKind.unavailable, MESSAGE.unavailable);
}

/** The Studio's own check refused the input; only a request that did not come from the upload form gets here. */
export function mapInvalidFile(message: string): SubmitFailure {
  return failure(SubmitFailureKind.file, message);
}
