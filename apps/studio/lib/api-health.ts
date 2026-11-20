import "server-only";

import { env } from "~/data/env/server";
import { type ApiHealth, ApiHealthStatus } from "~/lib/api-health-types";
import { getReadiness } from "~/lib/formlens-api";
import { createLogger } from "~/lib/logger";

const log = createLogger({ module: "api-health" });

const HEALTH_TIMEOUT_MS = 3000;

/** The API's host (and port), or `"unknown"` when the configured URL cannot be read. Never the full URL. */
export function readApiHost(): string {
  try {
    return new URL(env.FORMLENS_API_URL).host;
  } catch {
    return "unknown";
  }
}

/** Asks the API's readiness probe. A down, slow or failing API is a result, never an exception. */
export async function checkApiHealth(): Promise<ApiHealth> {
  const host = readApiHost();

  try {
    const response = await getReadiness({ cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });

    if (response.status === 200) {
      return { host, status: ApiHealthStatus.connected };
    }
    log.withMetadata({ host, statusCode: response.status }).warn("API readiness probe answered not ready");
  } catch (error) {
    log.withError(error).withMetadata({ host }).warn("API readiness probe failed");
  }
  return { host, status: ApiHealthStatus.unavailable };
}
