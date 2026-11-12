import type { TemplateResponse } from "@form-lens/api-client";
import { listTemplates } from "~/lib/formlens-api";
import logger from "~/lib/logger";

export type TemplatesResult =
  | { status: "ok"; templates: Array<TemplateResponse>; total: number }
  | { status: "unavailable"; reason: string };

/** The first page of form templates. A down or failing API is a result, not an exception, so the page still renders. */
export async function loadTemplates(): Promise<TemplatesResult> {
  try {
    const response = await listTemplates({ limit: 20 }, { cache: "no-store" });

    if (response.status === 200) {
      return { status: "ok", templates: response.data.items, total: response.data.total };
    }
    logger.withMetadata({ problem: response.data, status: response.status }).warn("templates_request_refused");
    return { reason: response.data.title, status: "unavailable" };
  } catch (error) {
    logger.withError(error).warn("templates_request_failed");
    return { reason: "The FormLens API does not answer.", status: "unavailable" };
  }
}
