import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@szum-tech/design-system";
import Link from "next/link";

/** An unknown extraction, or one whose result expired: the API no longer knows it (AC28). */
export function ExtractionNotFound() {
  return (
    <Empty border="dashed">
      <EmptyHeader>
        <EmptyTitle className="text-heading-h3">Extraction not found</EmptyTitle>
        <EmptyDescription className="text-mute">
          This extraction does not exist or its result has expired. Upload the document again to read it.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/documents/new">New document</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
