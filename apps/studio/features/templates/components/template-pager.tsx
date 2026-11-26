import { Button } from "@szum-tech/design-system";
import Link from "next/link";

type TemplatePagerProps = {
  page: number;
  pageSize: number;
  total: number;
  search: string;
};

function pageHref(page: number, search: string): string {
  const params = new URLSearchParams();
  if (search !== "") {
    params.set("q", search);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query === "" ? "/forms" : `/forms?${query}`;
}

export function TemplatePager({ page, pageSize, total, search }: TemplatePagerProps) {
  const pageCount = Math.ceil(total / pageSize);

  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav aria-label="Pages" className="flex items-center justify-center gap-4">
      {page > 1 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={pageHref(page - 1, search)} rel="prev">
            Previous
          </Link>
        </Button>
      ) : null}
      <span className="text-mute">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Button asChild size="sm" variant="outline">
          <Link href={pageHref(page + 1, search)} rel="next">
            Next
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
