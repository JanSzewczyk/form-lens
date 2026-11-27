import "server-only";

import * as React from "react";
import { z } from "zod";

import { type ExtractionView, extractionViewSchema } from "~/features/extractions/schemas/extraction";
import { getExtraction } from "~/lib/formlens-api";
import { createLogger } from "~/lib/logger";

const log = createLogger({ module: "extractions-load-extraction" });

export type ExtractionResult =
  | { status: "found"; extraction: ExtractionView }
  | { status: "not-found" }
  | { status: "unreachable" };

const idSchema = z.uuid();

/**
 * One extraction, as the status page shows it. The API answers 404 for an unknown id and for one whose result
 * expired, so both are "not found". An id that is not a UUID is never sent: the generated client puts it into the
 * path as it is, and it could not name an extraction anyway. A down API or an answer of another shape is a result too,
 * never a throw.
 */
export const loadExtraction = React.cache(async function loadExtraction(id: string): Promise<ExtractionResult> {
  if (!idSchema.safeParse(id).success) {
    return { status: "not-found" };
  }
  try {
    const response = await getExtraction(id, { cache: "no-store", signal: AbortSignal.timeout(10_000) });

    if (response.status === 200) {
      const parsed = extractionViewSchema.safeParse(response.data);
      if (parsed.success) {
        return { extraction: parsed.data, status: "found" };
      }
      log.withMetadata({ extractionId: id }).warn("Extraction answer has an unexpected shape");
      return { status: "unreachable" };
    }
    /** The documented statuses are 404 and 422, but a proxy or a crash can answer anything; read it as a plain answer. */
    const answer: { status: number } = response;
    if (answer.status === 404 || answer.status === 422) {
      log.withMetadata({ extractionId: id, statusCode: answer.status }).warn("Extraction not found");
      return { status: "not-found" };
    }
    log.withMetadata({ extractionId: id, statusCode: answer.status }).warn("Extraction request refused");
    return { status: "unreachable" };
  } catch (error) {
    log.withError(error).withMetadata({ extractionId: id }).warn("Extraction request failed");
    return { status: "unreachable" };
  }
});
