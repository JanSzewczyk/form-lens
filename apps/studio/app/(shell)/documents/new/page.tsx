import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@szum-tech/design-system";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { env } from "~/data/env/server";
import { ChooseFormList } from "~/features/extractions/components/choose-form-list";
import { FieldsToFindCard } from "~/features/extractions/components/fields-to-find-card";
import { NewDocumentStep, NewDocumentStepper } from "~/features/extractions/components/new-document-stepper";
import { SelectedFormItem } from "~/features/extractions/components/selected-form-item";
import { UploadForm } from "~/features/extractions/components/upload-form";
import { submitExtraction } from "~/features/extractions/server/extraction-actions";
import { loadTemplate } from "~/features/templates/server/load-template";
import { loadTemplates } from "~/features/templates/server/load-templates";

export const metadata: Metadata = {
  title: "New document"
};

/** The forms come from the API at request time; the build must not need the API. */
export const dynamic = "force-dynamic";

/** The API refuses a longer search with a 422, which the list would report as an unavailable API. */
const MAX_SEARCH_LENGTH = 100;
/** The last page whose offset stays inside the API's 2**31 - 1 limit with 12 forms per page (see the Forms page). */
const MAX_PAGE = 178_956_971;

const templateIdSchema = z.uuid();

type SearchParams = PageProps<"/documents/new">["searchParams"] extends Promise<infer Params> ? Params : never;

function firstValue(value: string | Array<string> | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function parseSearchParams(params: SearchParams) {
  const templateId = firstValue(params.template).trim();
  const search = firstValue(params.q).trim().slice(0, MAX_SEARCH_LENGTH);
  const parsedPage = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage >= 1 ? Math.min(parsedPage, MAX_PAGE) : 1;

  return { page, search, templateId };
}

/**
 * The step lives in the URL: no `?template` is Choose form, a `?template=<id>` is Upload. An id that is not a UUID is
 * never sent: the generated client puts it into the path as it is (`../extractions` would call another endpoint), and it
 * could not name a form anyway.
 */
async function loadData(searchParams: PageProps<"/documents/new">["searchParams"]) {
  const { page, search, templateId } = parseSearchParams(await searchParams);

  if (templateId === "") {
    return { page, result: await loadTemplates({ page, search }), search, step: NewDocumentStep.chooseForm } as const;
  }

  if (!templateIdSchema.safeParse(templateId).success) {
    return { maxMb: env.FORMLENS_MAX_UPLOAD_MB, step: NewDocumentStep.upload, template: null } as const;
  }

  const result = await loadTemplate(templateId);
  if (result.status === "unavailable") {
    throw new Error(`Failed to load the form: ${result.reason}`);
  }
  return {
    maxMb: env.FORMLENS_MAX_UPLOAD_MB,
    step: NewDocumentStep.upload,
    template: result.status === "found" ? result.template : null
  } as const;
}

export default async function NewDocumentPage({ searchParams }: PageProps<"/documents/new">) {
  const data = await loadData(searchParams);

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-heading-h1">New document</h1>
        <p className="text-mute">Upload a document and the API will find the fields defined in the selected form.</p>
      </header>
      <NewDocumentStepper current={data.step} />
      {data.step === NewDocumentStep.chooseForm ? (
        <ChooseFormList page={data.page} result={data.result} search={data.search} />
      ) : data.template === null ? (
        <Empty border="dashed">
          <EmptyHeader>
            <EmptyTitle className="text-heading-h3">Form not found</EmptyTitle>
            <EmptyDescription className="text-mute">
              This form does not exist. It may have been deleted. Choose another form to continue.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/documents/new">Choose form</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex min-w-0 flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
            <SelectedFormItem template={data.template} />
            <UploadForm maxMb={data.maxMb} onSubmitAction={submitExtraction.bind(null, data.template.id)} />
          </div>
          <div className="min-w-0 flex-[1_1_300px]">
            <FieldsToFindCard template={data.template} />
          </div>
        </div>
      )}
    </>
  );
}
