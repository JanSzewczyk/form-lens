"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "~/data/env/server";
import {
  CancelFailureKind,
  type CancelResult,
  extractionViewSchema,
  type SubmitFailure
} from "~/features/extractions/schemas/extraction";
import { loadExtraction } from "~/features/extractions/server/load-extraction";
import {
  mapExtractionProblem,
  mapExtractionUnreachable,
  mapInvalidFile
} from "~/features/extractions/server/map-extraction-error";
import { checkFile } from "~/features/extractions/utils/accepted-file";
import { cancelExtraction as cancelExtractionRequest, createExtraction } from "~/lib/formlens-api";
import { createLogger } from "~/lib/logger";

const log = createLogger({ module: "extractions-actions" });

/** The file crosses the network twice (browser to Studio, Studio to API), so the API gets longer than a plain call. */
const REQUEST_TIMEOUT_MS = 60_000;

const submitInputSchema = z.object({
  file: z.instanceof(File, { message: "Choose a file to analyse." }),
  templateId: z.uuid()
});

/** Only resolves a relative `Location`; the host is never used. */
const LOCATION_BASE = "http://location.invalid";

/** The problem fields safe to log: the whole body may repeat what the user sent, such as the file name. */
const loggedProblemSchema = z.object({ title: z.string().optional(), type: z.string().optional() });

/**
 * The extraction id from a `Location` such as `/v1/extractions/<id>` (relative or absolute, with or without a query), or
 * `undefined` when it holds none.
 */
function extractionIdOf(location: string | null): string | undefined {
  if (location === null || !URL.canParse(location, LOCATION_BASE)) {
    return undefined;
  }
  const id = new URL(location, LOCATION_BASE).pathname.match(/\/extractions\/([^/]+)\/?$/)?.[1];
  return z.uuid().safeParse(id).success ? id : undefined;
}

type Submitted = { extractionId: string } | { failure: SubmitFailure };

/** Sends the document to the API. It never throws, so the `redirect` that follows stays outside any `try`. */
async function sendDocument(templateId: string, file: File): Promise<Submitted> {
  try {
    const answer = await createExtraction(
      { file, template_id: templateId },
      { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (answer.status === 202) {
      const extractionId = extractionIdOf(answer.headers.get("location"));
      if (extractionId !== undefined) {
        return { extractionId };
      }
      log
        .withMetadata({ operation: "submitExtraction", statusCode: answer.status })
        .error("Extraction has no Location");
      return { failure: mapExtractionUnreachable() };
    }
    /** The documented statuses are listed in the client, but a proxy or a crash can answer anything. */
    const refused: { data: unknown; headers: Headers; status: number } = answer;
    const problem = loggedProblemSchema.safeParse(refused.data);
    log
      .withMetadata({
        operation: "submitExtraction",
        problemTitle: problem.success ? problem.data.title : undefined,
        problemType: problem.success ? problem.data.type : undefined,
        statusCode: refused.status,
        templateId
      })
      .warn("Extraction request refused");
    return { failure: mapExtractionProblem(refused.status, refused.data, refused.headers) };
  } catch (error) {
    log.withError(error).withMetadata({ operation: "submitExtraction", templateId }).error("Extraction request failed");
    return { failure: mapExtractionUnreachable() };
  }
}

/**
 * Queues the chosen file to be read against the template and opens its status page. The file is checked again here,
 * since anyone can post to the action without going through the drop zone.
 */
export async function submitExtraction(
  templateId: string,
  _previous: SubmitFailure | null,
  formData: FormData
): Promise<SubmitFailure> {
  const parsed = submitInputSchema.safeParse({ file: formData.get("file"), templateId });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue?.path[0] === "templateId"
      ? mapExtractionProblem(404, undefined, new Headers())
      : mapInvalidFile(issue?.message ?? "Choose a file to analyse.");
  }

  const refusal = checkFile(parsed.data.file, env.FORMLENS_MAX_UPLOAD_MB);
  if (refusal !== null) {
    return mapInvalidFile(refusal);
  }

  const submitted = await sendDocument(parsed.data.templateId, parsed.data.file);
  if ("failure" in submitted) {
    return submitted.failure;
  }

  log
    .withMetadata({ extractionId: submitted.extractionId, operation: "submitExtraction", templateId })
    .info("Extraction created");
  redirect(`/jobs/${submitted.extractionId}`);
}

const CANCEL_TIMEOUT_MS = 10_000;

const CANCEL_MESSAGE = {
  finished: "The extraction ended before it could be cancelled.",
  notFound: "This extraction no longer exists. Its result may have expired.",
  unavailable: "The job could not be cancelled: the API is unavailable. Try again in a moment."
} as const;

const cancelNotFound: CancelResult = {
  error: CANCEL_MESSAGE.notFound,
  kind: CancelFailureKind.notFound,
  success: false
};

const cancelUnavailable: CancelResult = {
  error: CANCEL_MESSAGE.unavailable,
  kind: CancelFailureKind.unavailable,
  success: false
};

/** The cancel was refused because the extraction already ended: its final state, read again, is what the page shows. */
async function finishedBeforeCancel(extractionId: string): Promise<CancelResult> {
  const current = await loadExtraction(extractionId);
  if (current.status === "found") {
    return {
      error: CANCEL_MESSAGE.finished,
      extraction: current.extraction,
      kind: CancelFailureKind.finished,
      success: false
    };
  }
  return current.status === "not-found" ? cancelNotFound : cancelUnavailable;
}

/**
 * Stops an unfinished extraction. A 409 means it ended first (the cancel raced completion), so the answer carries its
 * final state instead. It never throws; the page shows the returned message as it is.
 */
export async function cancelExtraction(extractionId: string): Promise<CancelResult> {
  if (!z.uuid().safeParse(extractionId).success) {
    return cancelNotFound;
  }

  try {
    const answer = await cancelExtractionRequest(extractionId, {
      cache: "no-store",
      signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS)
    });
    if (answer.status === 200) {
      const parsed = extractionViewSchema.safeParse(answer.data);
      if (parsed.success) {
        log.withMetadata({ extractionId, operation: "cancelExtraction" }).info("Extraction cancelled");
        return { extraction: parsed.data, success: true };
      }
      log
        .withMetadata({ extractionId, operation: "cancelExtraction" })
        .error("Cancelled extraction has an unexpected shape");
      return cancelUnavailable;
    }
    /** The documented statuses are 404, 409 and 422, but a proxy or a crash can answer anything. */
    const refused: { data: unknown; status: number } = answer;
    const problem = loggedProblemSchema.safeParse(refused.data);
    log
      .withMetadata({
        extractionId,
        operation: "cancelExtraction",
        problemType: problem.success ? problem.data.type : undefined,
        statusCode: refused.status
      })
      .warn("Extraction cancel refused");
    if (refused.status === 409) {
      return await finishedBeforeCancel(extractionId);
    }
    return refused.status === 404 || refused.status === 422 ? cancelNotFound : cancelUnavailable;
  } catch (error) {
    log
      .withError(error)
      .withMetadata({ extractionId, operation: "cancelExtraction" })
      .error("Extraction cancel failed");
    return cancelUnavailable;
  }
}
