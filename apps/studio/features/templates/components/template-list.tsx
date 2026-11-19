import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@szum-tech/design-system";
import { FilePlusIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import type { TemplatesResult } from "~/features/templates/server/load-templates";

import { TemplateCard } from "./template-card";
import { TemplatePager } from "./template-pager";
import { TemplateSearch } from "./template-search";

type TemplateListProps = {
  result: TemplatesResult;
  /** The search the result was loaded with; an empty string means no search. */
  search: string;
  page: number;
  /** The moment "Last used" is counted back from. */
  now: Date;
};

export function TemplateList({ result, search, page, now }: TemplateListProps) {
  if (result.status === "unavailable") {
    return (
      <Alert role="alert" variant="destructive">
        <AlertTitle>The forms could not be loaded</AlertTitle>
        <AlertDescription>The FormLens API is not available ({result.reason}). Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const { templates, total, pageSize } = result;

  if (total === 0 && search === "") {
    return (
      <Empty border="dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FilePlusIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle className="text-heading-h3">No forms yet</EmptyTitle>
          <EmptyDescription className="text-mute">
            A form tells FormLens which fields to find in a document. Create the first one to get started.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/forms/new">Create your first form</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TemplateSearch search={search} />
        <p className="text-mute" role="status">
          {total === 1 ? "1 form" : `${total} forms`}
        </p>
      </div>
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
              <Link href="/forms">Clear search</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : templates.length === 0 ? (
        <Empty border="dashed">
          <EmptyHeader>
            <EmptyTitle className="text-heading-h3">There are no forms on this page</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={search === "" ? "/forms" : `/forms?q=${encodeURIComponent(search)}`}>
                Back to the first page
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-6">
          {templates.map((template) => (
            <li key={template.id}>
              <TemplateCard now={now} template={template} />
            </li>
          ))}
          <li>
            <Link className="block h-full" href="/forms/new">
              <Empty border="dashed" className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FilePlusIcon aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle className="text-heading-h4">New form</EmptyTitle>
                  <EmptyDescription className="text-mute">
                    Describe the fields to find in a new document type.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </Link>
          </li>
        </ul>
      )}
      <TemplatePager page={page} pageSize={pageSize} search={search} total={total} />
    </div>
  );
}
