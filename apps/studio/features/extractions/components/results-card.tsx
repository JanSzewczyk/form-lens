import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@szum-tech/design-system";

import type { ExtractionView } from "~/features/extractions/schemas/extraction";

type ResultsCardProps = {
  /** The fields of the form as it was at the submit, not the form as it is now. */
  fields: ExtractionView["fields"];
};

/** The Results panel while the extraction is unfinished: one placeholder per field of the submitted form. */
export function ResultsCard({ fields }: ResultsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-h4">Results</CardTitle>
        <CardDescription>Data will appear here when the analysis finishes.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul aria-label="Results" className="flex flex-col gap-4">
          {fields.map((field) => (
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
