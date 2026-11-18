import { NextResponse } from "next/server";
import { checkApiHealth } from "~/lib/api-health";

// The answer is the API's state right now; it must never be prerendered or cached.
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkApiHealth();

  return NextResponse.json(health, { headers: { "Cache-Control": "no-store" } });
}
