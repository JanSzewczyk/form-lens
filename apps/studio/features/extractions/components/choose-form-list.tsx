import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input
} from "@szum-tech/design-system";
import { FilePlusIcon, FileQuestionIcon, SearchIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { type TemplatesResult, TemplatesStatus } from "~/features/templates/types/templates-result";

const CHOOSE_FORM_PATH = "/documents/new";

type ChooseFormListProps = {
  result: TemplatesResult;
  /** The search the result was loaded with; an empty string means no search. */
  search: string;
  page: number;
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
  return query === "" ? CHOOSE_FORM_PATH : `${CHOOSE_FORM_PATH}?${query}`;
}

/**
 * The Choose form step: one card per form, a search and pages. The search form and the pager follow
 * `template-search.tsx` and `template-pager.tsx`, which link to `/forms` only.
 */
export function ChooseFormList({ result, search, page }: ChooseFormListProps) {
  if (result.status === TemplatesStatus.unavailable) {
    return (
      <Alert role="alert" variant="destructive">
        <AlertTitle>The forms could not be loaded</AlertTitle>
        <AlertDescription>The FormLens API is not available. Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const { templates, total, pageSize } = result;
  const pageCount = Math.ceil(total / pageSize);

  if (total === 0 && search === "") {
    return (
      <Empty border="dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FilePlusIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle className="text-heading-h3">No forms yet</EmptyTitle>
          <EmptyDescription className="text-mute">
            A document is read against a form. Create a form first, then come back to upload.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/forms/new">New form</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (total > 0 && page > pageCount) {
    return (
      <Empty border="dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestionIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle className="text-heading-h3">There is no page {page}</EmptyTitle>
          <EmptyDescription className="text-mute">
            {pageCount === 1 ? "The forms fit on 1 page." : `The forms fit on ${pageCount} pages.`}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href={pageHref(pageCount, search)}>Go to the last page</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={CHOOSE_FORM_PATH} className="flex w-full max-w-[380px] gap-2" method="get" role="search">
        <Input
          aria-label="Search forms"
          defaultValue={search}
          maxLength={100}
          name="q"
          placeholder="Search forms"
          type="search"
        />
        <Button startIcon={<SearchIcon aria-hidden />} type="submit" variant="outline">
          Search
        </Button>
      </form>
      {total === 0 ? (
        <Empty border="dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle className="text-heading-h3">No forms match your search</EmptyTitle>
            <EmptyDescription className="text-mute">
              Nothing is named like “{search}”. Try a shorter word.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={CHOOSE_FORM_PATH}>Clear search</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul aria-label="Forms" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,290px),1fr))] gap-6">
          {templates.map((template) => (
            <li className="min-w-0" key={template.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-heading-h3 wrap-anywhere">{template.name}</CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Badge variant="secondary">
                    {template.fields.length === 1 ? "1 field" : `${template.fields.length} fields`}
                  </Badge>
                </CardContent>
                <CardFooter>
                  <Button asChild size="sm">
                    <Link
                      aria-label={`Select ${template.name}`}
                      href={`${CHOOSE_FORM_PATH}?template=${encodeURIComponent(template.id)}`}
                    >
                      Select
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 ? (
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
      ) : null}
    </div>
  );
}
