import "server-only";

import { env } from "~/data/env/server";
import type { ApiHealth } from "~/lib/api-health-types";
import { getReadiness } from "~/lib/formlens-api";
import logger from "~/lib/logger";

const HEALTH_TIMEOUT_MS = 3000;

function readHost(): string {
  try {
    return new URL(env.FORMLENS_API_URL).host;
  } catch {
    return "unknown";
  }
}

/** Asks the API's readiness probe. A down, slow or failing API is a result, never an exception. */
export async function checkApiHealth(): Promise<ApiHealth> {
  const host = readHost();

  try {
    const response = await getReadiness({ cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });

    if (response.status === 200) {
      return { host, status: "connected" };
    }
    logger.withMetadata({ host, statusCode: response.status }).warn("api_health_not_ready");
  } catch (error) {
    logger.withError(error).withMetadata({ host }).warn("api_health_check_failed");
  }
  return { host, status: "unavailable" };
}
