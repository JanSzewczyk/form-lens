import "server-only";

import { NextResponse } from "next/server";

import { checkApiHealth, readApiHost } from "~/lib/api-health";
import { type ApiHealth, ApiHealthStatus } from "~/lib/api-health-types";
import { createLogger } from "~/lib/logger";

const log = createLogger({ module: "api-status-route" });

/** The answer is the API's state right now; it must never be prerendered or cached. */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The API state as `{ status, host }`. `checkApiHealth` never throws by contract, but the poller must still get an
 * answer if that ever breaks, so a throw becomes "unavailable".
 */
export async function GET() {
  let health: ApiHealth;
  try {
    health = await checkApiHealth();
  } catch (error) {
    log.withError(error).warn("API status route failed");
    health = { host: readApiHost(), status: ApiHealthStatus.unavailable };
  }

  return NextResponse.json(health, { headers: NO_STORE });
}
