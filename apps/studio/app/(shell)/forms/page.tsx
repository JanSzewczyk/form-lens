import { Button } from "@szum-tech/design-system";
import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionToast, type ActionToastFlag } from "~/features/templates/components/action-toast";
import { TemplateList } from "~/features/templates/components/template-list";
import { loadTemplates } from "~/features/templates/server/load-templates";

export const metadata: Metadata = {
  title: "Forms"
};

/** The list comes from the API at request time; the build must not need the API. */
export const dynamic = "force-dynamic";

/** The API refuses a longer search with a 422, which the list would report as an unavailable API. */
const MAX_SEARCH_LENGTH = 100;
/**
 * The API refuses an offset above 2**31 - 1 with a 422, which the list would report as an unavailable API. With 12 forms
 * per page the last page that keeps `(page - 1) * 12` inside that limit is floor((2**31 - 1) / 12) + 1.
 */
const MAX_PAGE = 178_956_971;
const TOAST_FLAGS: Array<ActionToastFlag> = ["created", "saved", "deleted"];

type SearchParams = PageProps<"/forms">["searchParams"] extends Promise<infer Params> ? Params : never;

function firstValue(value: string | Array<string> | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function parseSearchParams(params: SearchParams) {
  const search = firstValue(params.q).trim().slice(0, MAX_SEARCH_LENGTH);
  const parsedPage = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage >= 1 ? Math.min(parsedPage, MAX_PAGE) : 1;
  const flag = TOAST_FLAGS.find((name) => firstValue(params[name]) === "1") ?? null;

  return { flag, page, search };
}

async function loadData(searchParams: PageProps<"/forms">["searchParams"]) {
  const { flag, page, search } = parseSearchParams(await searchParams);
  const result = await loadTemplates({ page, search });

  return { flag, now: new Date(), page, result, search };
}

export default async function FormsPage({ searchParams }: PageProps<"/forms">) {
  const { flag, now, page, result, search } = await loadData(searchParams);

  return (
    <>
      <ActionToast flag={flag} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-heading-h1">Forms</h1>
          <p className="text-mute">Templates that tell FormLens which fields to find in a document.</p>
        </div>
        <Button asChild startIcon={<PlusIcon aria-hidden />}>
          <Link href="/forms/new">New form</Link>
        </Button>
      </div>
      <TemplateList now={now} page={page} result={result} search={search} />
    </>
  );
}
