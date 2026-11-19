import type { TemplateResponse } from "@form-lens/api-client";
import { listTemplates } from "~/lib/formlens-api";
import logger from "~/lib/logger";

const PAGE_SIZE = 12;
/** A stalled API must not leave the page on its loading skeleton; same limit as the health check. */
const REQUEST_TIMEOUT_MS = 3000;
const REFUSED_REASON = "The FormLens API refused the request.";

export type TemplatesQuery = {
  /** Part of a template name; an empty string means no search. */
  search: string;
  /** 1-based page number. */
  page: number;
};

export type TemplatesResult =
  | { status: "ok"; templates: Array<TemplateResponse>; total: number; pageSize: number }
  | { status: "unavailable"; reason: string };

/**
 * One page of form templates, optionally filtered by name. A down or failing API is a result, not an exception,
 * so the page still renders.
 */
export async function loadTemplates({ search, page }: TemplatesQuery): Promise<TemplatesResult> {
  const trimmedSearch = search.trim();

  try {
    const response = await listTemplates(
      { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, search: trimmedSearch === "" ? undefined : trimmedSearch },
      { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );

    if (response.status === 200) {
      return { pageSize: PAGE_SIZE, status: "ok", templates: response.data.items, total: response.data.total };
    }
    logger.withMetadata({ problem: response.data, status: response.status }).warn("templates_request_refused");
    return { reason: response.data?.title || REFUSED_REASON, status: "unavailable" };
  } catch (error) {
    logger.withError(error).warn("templates_request_failed");
    return { reason: "The FormLens API does not answer.", status: "unavailable" };
  }
}
