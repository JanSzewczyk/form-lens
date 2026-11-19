import "server-only";

import type { TemplateResponse } from "@form-lens/api-client";
import * as React from "react";

import { getTemplate } from "~/lib/formlens-api";
import { createLogger } from "~/lib/logger";

const log = createLogger({ module: "templates-load-template" });

export type TemplateResult =
  | { status: "found"; template: TemplateResponse }
  | { status: "not-found" }
  | { status: "unavailable"; reason: string };

/**
 * One template. A missing template is a result, and so is an id the API cannot read as a template id (it answers 422
 * to `/forms/not-an-id/edit`), since both mean "there is no such form". A down API is a result too, never a throw.
 */
export const loadTemplate = React.cache(async function loadTemplate(id: string): Promise<TemplateResult> {
  try {
    const response = await getTemplate(id, { cache: "no-store", signal: AbortSignal.timeout(10_000) });

    if (response.status === 200) {
      return { status: "found", template: response.data };
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
