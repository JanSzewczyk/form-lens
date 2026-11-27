import "server-only";

import { FieldType, type TemplateResponse } from "@form-lens/api-client";
import * as React from "react";
import { z } from "zod";

import { getTemplate } from "~/lib/formlens-api";
import { createLogger } from "~/lib/logger";

const log = createLogger({ module: "templates-load-template" });

export type TemplateResult =
  | { status: "found"; template: TemplateResponse }
  | { status: "not-found" }
  | { status: "unavailable"; reason: string };

const templateIdSchema = z.uuid();

/**
 * An id that is not a UUID cannot name a template. It must never reach the API: the generated client puts it into the
 * path as it is, so `../extractions` would call another endpoint.
 */
export function isTemplateId(id: string): boolean {
  return templateIdSchema.safeParse(id).success;
}

/** The template as the API documents it; the annotation fails the type-check when the two drift apart. */
const templateResponseSchema: z.ZodType<TemplateResponse> = z.object({
  created_at: z.string(),
  description: z.string(),
  fields: z.array(
    z.object({
      allowed_values: z.array(z.string()).nullish(),
      description: z.string().optional(),
      maximum: z.number().nullish(),
      minimum: z.number().nullish(),
      name: z.string(),
      pattern: z.string().nullish(),
      required: z.boolean().optional(),
      type: z.enum(FieldType)
    })
  ),
  id: z.string(),
  json_schema: z.record(z.string(), z.unknown()),
  last_used_at: z.string().nullable(),
  name: z.string(),
  updated_at: z.string(),
  version: z.number().int()
});

/**
 * One template. A missing template is a result, and so is an id that cannot be a template id (never sent; the API would
 * answer 422), since both mean "there is no such form". A down API, or an answer of another shape, is a result too,
 * never a throw.
 */
export const loadTemplate = React.cache(async function loadTemplate(id: string): Promise<TemplateResult> {
  if (!isTemplateId(id)) {
    return { status: "not-found" };
  }
  try {
    const response = await getTemplate(id, { cache: "no-store", signal: AbortSignal.timeout(10_000) });

    if (response.status === 200) {
      const parsed = templateResponseSchema.safeParse(response.data);
      if (parsed.success) {
        return { status: "found", template: parsed.data };
      }
      log.withMetadata({ templateId: id }).warn("Template answer has an unexpected shape");
      return { reason: "The FormLens API answered with an unexpected template.", status: "unavailable" };
    }
    /** The documented statuses are 404 and 422, but a proxy or a crash can answer anything; read it as a plain answer. */
    const answer: { data: unknown; status: number } = response;
    if (answer.status === 404 || answer.status === 422) {
      log.withMetadata({ statusCode: answer.status, templateId: id }).warn("Template not found");
      return { status: "not-found" };
    }
    log.withMetadata({ problem: answer.data, statusCode: answer.status }).warn("Template request refused");
    return { reason: "The FormLens API refused the request.", status: "unavailable" };
  } catch (error) {
    log.withError(error).warn("Template request failed");
    return { reason: "The FormLens API does not answer.", status: "unavailable" };
  }
});
