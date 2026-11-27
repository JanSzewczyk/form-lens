import "server-only";

import { NextResponse } from "next/server";

import { ExtractionResultStatus, loadExtraction } from "~/features/extractions/server/load-extraction";

/** The answer is the extraction's state right now; it must never be prerendered or cached. */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The status page polls this every 3 s: `200 ExtractionView`, `404 { notFound }` for an unknown or expired extraction,
 * `502 { unreachable }` when the API cannot be asked. `loadExtraction` logs and never throws.
 */
export async function GET(_request: Request, context: RouteContext<"/api/extractions/[id]">) {
  const { id } = await context.params;
  const result = await loadExtraction(id);

  if (result.status === ExtractionResultStatus.found) {
    return NextResponse.json(result.extraction, { headers: NO_STORE });
  }
  if (result.status === ExtractionResultStatus.notFound) {
    return NextResponse.json({ notFound: true }, { headers: NO_STORE, status: 404 });
  }
  return NextResponse.json({ unreachable: true }, { headers: NO_STORE, status: 502 });
}
