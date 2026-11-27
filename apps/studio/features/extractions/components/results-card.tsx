import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Skeleton
} from "@szum-tech/design-system";
import Link from "next/link";

import { type ExtractionView, ExtractionViewStatus } from "~/features/extractions/schemas/extraction";
import { describeMissingRequired, getResultRows, ResultRowState } from "~/features/extractions/utils/result-rows";

type ResultsCardProps = {
  /** `fields` is the form as it was at the submit, not the form as it is now. */
  extraction: Pick<ExtractionView, "fields" | "missing_required" | "result" | "status">;
};

function NewDocumentFooter() {
  return (
    <CardFooter>
      <Button asChild variant="outline">
        <Link href="/documents/new">New document</Link>
      </Button>
    </CardFooter>
  );
}

/**
 * The Results panel: one placeholder per field while the extraction is unfinished, one row per field once it completed
 * (its value, "Not found" or "Missing required"), and no rows for a cancelled or failed one. Values are React text.
 */
export function ResultsCard({ extraction }: ResultsCardProps) {
  if (extraction.status === ExtractionViewStatus.completed) {
    const rows = getResultRows(extraction);
    const missingSummary = describeMissingRequired(rows);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-h4">Results</CardTitle>
          <CardDescription>
            {missingSummary === null ? "Every required field was found." : `${missingSummary}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul aria-label="Results" className="flex flex-col gap-4">
            {rows.map((row) => (
              <li className="flex min-w-0 flex-col gap-1.5" key={row.name}>
                <span className="text-small font-code break-all">{row.name}</span>
                {row.state === ResultRowState.found ? (
                  <span className="text-body-sm break-words whitespace-pre-wrap">{row.value}</span>
                ) : row.state === ResultRowState.missingRequired ? (
                  <Badge className="self-start" variant="error">
                    Missing required
                  </Badge>
                ) : (
                  <span className="text-mute">Not found</span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
        <NewDocumentFooter />
      </Card>
    );
  }

  if (extraction.status === ExtractionViewStatus.cancelled || extraction.status === ExtractionViewStatus.failed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-h4">Results</CardTitle>
          <CardDescription>
            {extraction.status === ExtractionViewStatus.cancelled
              ? "The job was cancelled before the document was read, so there are no results."
              : "The document could not be read, so there are no results."}
          </CardDescription>
        </CardHeader>
        <NewDocumentFooter />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-h4">Results</CardTitle>
        <CardDescription>Data will appear here when the analysis finishes.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul aria-label="Results" className="flex flex-col gap-4">
          {extraction.fields.map((field) => (
            <li className="flex min-w-0 flex-col gap-1.5" key={field.name}>
              <span className="text-small font-code break-all">{field.name}</span>
              <Skeleton className="h-[18px] w-[70%] rounded-md" />
              <span className="sr-only">Waiting for the result</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
