"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TemplateActionFailure } from "~/features/templates/schemas/template-action-result";
import { type TemplateFormValues, templateFormSchema } from "~/features/templates/schemas/template-form-schema";
import { mapInvalidInput, mapProblem, mapUnreachable } from "~/features/templates/server/map-service-error";
import { toTemplateBody } from "~/features/templates/utils/template-mapping";
import {
  createTemplate as createTemplateRequest,
  deleteTemplate as deleteTemplateRequest,
  replaceTemplate
} from "~/lib/formlens-api";
import { createLogger } from "~/lib/logger";

const log = createLogger({ module: "templates-actions" });

const REQUEST_TIMEOUT_MS = 10_000;
const FORMS_PATH = "/forms";

type ApiAnswer = { data: unknown; status: number };

/**
 * Runs one API call. `undefined` is success; a failure is already mapped for the user and logged with the raw
 * problem. It never throws, so the `redirect` that follows can stay outside any `try`.
 */
async function callApi(
  operation: string,
  successStatus: number,
  request: (options: RequestInit) => Promise<ApiAnswer>
): Promise<TemplateActionFailure | undefined> {
  try {
    const answer = await request({ cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (answer.status === successStatus) {
      return undefined;
    }
    log.withMetadata({ operation, problem: answer.data, statusCode: answer.status }).warn("Template request refused");
    return mapProblem(answer.status, problemOf(answer.data));
  } catch (error) {
    log.withError(error).withMetadata({ operation }).error("Template request failed");
    return mapUnreachable();
  }
}

const templateIdSchema = z.uuid();

/** An id that is not a UUID cannot name a template; it never reaches the API, whose path it would otherwise reshape. */
function isTemplateId(templateId: string): boolean {
  return templateIdSchema.safeParse(templateId).success;
}

const problemSchema = z.object({
  detail: z.string().nullish(),
  errors: z
    .array(z.object({ loc: z.array(z.union([z.string(), z.number()])), msg: z.string(), type: z.string() }))
    .nullish(),
  status: z.number(),
  title: z.string()
});

function problemOf(data: unknown) {
  const parsed = problemSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

export async function createTemplate(input: TemplateFormValues): Promise<TemplateActionFailure> {
  const parsed = templateFormSchema.safeParse(input);
  if (!parsed.success) {
    return mapInvalidInput(parsed.error);
  }

  const failure = await callApi("createTemplate", 201, (options) =>
    createTemplateRequest(toTemplateBody(parsed.data), options)
  );
  if (failure) {
    return failure;
  }

  revalidatePath(FORMS_PATH);
  redirect(`${FORMS_PATH}?created=1`);
}

export async function updateTemplate(templateId: string, input: TemplateFormValues): Promise<TemplateActionFailure> {
  const parsed = templateFormSchema.safeParse(input);
  if (!parsed.success) {
    return mapInvalidInput(parsed.error);
  }

  if (!isTemplateId(templateId)) {
    return mapProblem(404, undefined);
  }

  const failure = await callApi("updateTemplate", 200, (options) =>
    replaceTemplate(templateId, toTemplateBody(parsed.data), options)
  );
  if (failure) {
    return failure;
  }

  revalidatePath(FORMS_PATH);
  redirect(`${FORMS_PATH}?saved=1`);
}

export async function deleteTemplate(templateId: string): Promise<TemplateActionFailure> {
  if (!isTemplateId(templateId)) {
    return mapProblem(404, undefined);
  }

  const failure = await callApi("deleteTemplate", 204, (options) => deleteTemplateRequest(templateId, options));
  if (failure) {
    return failure;
  }

  revalidatePath(FORMS_PATH);
  redirect(`${FORMS_PATH}?deleted=1`);
}
