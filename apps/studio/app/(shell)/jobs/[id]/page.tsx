import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ExtractionStatusView } from "~/features/extractions/components/extraction-status-view";
import { loadExtraction } from "~/features/extractions/server/load-extraction";

/** The status comes from the API at request time; the build must not need the API. */
export const dynamic = "force-dynamic";

/** The first render comes from the server, so a reload or a shared address shows the current status at once (AC27). */
async function loadData(id: string) {
  const result = await loadExtraction(id);

  if (result.status === "not-found") {
    notFound();
  }
  if (result.status === "unreachable") {
    throw new Error("Failed to load the extraction: the FormLens API does not answer.");
  }
  return { extraction: result.extraction };
}

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const result = await loadExtraction(id);

  return { title: result.status === "found" ? `Job ${result.extraction.template_name}` : "Job" };
}

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const { extraction } = await loadData(id);

  return <ExtractionStatusView initial={extraction} />;
}
