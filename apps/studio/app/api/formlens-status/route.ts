import { NextResponse } from "next/server";
import { env } from "~/data/env/server";
import { checkApiHealth } from "~/lib/api-health";
import type { ApiHealth } from "~/lib/api-health-types";
import logger from "~/lib/logger";

// The answer is the API's state right now; it must never be prerendered or cached.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function readHost(): string {
  try {
    return new URL(env.FORMLENS_API_URL).host;
  } catch {
    return "unknown";
  }
}

export async function GET() {
  let health: ApiHealth;
  try {
    health = await checkApiHealth();
  } catch (error) {
    // checkApiHealth never throws by contract; the poller still must get an answer if that ever breaks.
    logger.withError(error).warn("api_status_route_failed");
    health = { host: readHost(), status: "unavailable" };
  }

  return NextResponse.json(health, { headers: NO_STORE });
}
