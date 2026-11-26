import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TemplateEditor } from "~/features/templates/components/template-editor";
import { loadTemplate } from "~/features/templates/server/load-template";
import { deleteTemplate, updateTemplate } from "~/features/templates/server/template-actions";
import { toFormValues } from "~/features/templates/utils/template-mapping";

/** The template comes from the API at request time; the build must not need the API. */
export const dynamic = "force-dynamic";

async function loadData(id: string) {
  const result = await loadTemplate(id);

  if (result.status === "not-found") {
    notFound();
  }
  if (result.status === "unavailable") {
    throw new Error(`Failed to load the form: ${result.reason}`);
  }
  return { template: result.template };
}

export async function generateMetadata({ params }: PageProps<"/forms/[id]/edit">): Promise<Metadata> {
  const { id } = await params;
  const result = await loadTemplate(id);

  return { title: result.status === "found" ? `Edit ${result.template.name}` : "Edit form" };
}

export default async function EditFormPage({ params }: PageProps<"/forms/[id]/edit">) {
  const { id } = await params;
  const { template } = await loadData(id);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-heading-h1">Edit form</h1>
        <p className="text-mute">Version {template.version}. Saving replaces the fields and raises the version.</p>
      </header>
      <TemplateEditor
        initialValues={toFormValues(template)}
        mode="edit"
        onDeleteAction={deleteTemplate.bind(null, id)}
        onSubmitAction={updateTemplate.bind(null, id)}
      />
    </>
  );
}
