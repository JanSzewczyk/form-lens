import "server-only";

import { type TemplatesResult, TemplatesStatus } from "~/features/templates/types/templates-result";
import { listTemplates } from "~/lib/formlens-api";
import { createLogger } from "~/lib/logger";

const log = createLogger({ module: "templates-load-templates" });

const PAGE_SIZE = 12;
/** A stalled API must not leave the page on its loading skeleton; same limit as the health check. */
const REQUEST_TIMEOUT_MS = 3000;

export type TemplatesQuery = {
  /** Part of a template name; an empty string means no search. */
  search: string;
  /** 1-based page number. */
  page: number;
};

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
      return {
        pageSize: PAGE_SIZE,
        status: TemplatesStatus.ok,
        templates: response.data.items,
        total: response.data.total
      };
    }
    log.withMetadata({ problem: response.data, statusCode: response.status }).warn("Templates request refused");
    return { status: TemplatesStatus.unavailable };
  } catch (error) {
    log.withError(error).warn("Templates request failed");
    return { status: TemplatesStatus.unavailable };
  }
}
