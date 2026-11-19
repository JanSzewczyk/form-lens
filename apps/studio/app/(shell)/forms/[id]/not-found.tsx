import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@szum-tech/design-system";
import Link from "next/link";

export default function FormNotFound() {
  return (
    <Empty border="dashed">
      <EmptyHeader>
        <EmptyTitle>Form not found</EmptyTitle>
        <EmptyDescription>This form does not exist. It may have been deleted.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/forms">Back to Forms</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
