import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent } from "@szum-tech/design-system";
import Link from "next/link";

const FALLBACK_MESSAGE = "The document could not be read.";

type ExtractionFailedProps = {
  /** The API's message for people; it never holds text of the document and is rendered as React text. */
  message: string | null | undefined;
  /** The form the document was read against; Try again opens its Upload step. */
  templateId: string;
};

/** A failed extraction: why it failed, and Try again with the same form (AC26). */
export function ExtractionFailed({ message, templateId }: ExtractionFailedProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>The document could not be read</AlertTitle>
          <AlertDescription>{message || FALLBACK_MESSAGE}</AlertDescription>
        </Alert>
        <Button asChild className="self-start">
          <Link href={`/documents/new?template=${encodeURIComponent(templateId)}`}>Try again</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
