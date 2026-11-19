import type { Metadata } from "next";

import { TemplateEditor } from "~/features/templates/components/template-editor";
import { createTemplate } from "~/features/templates/server/template-actions";
import { emptyTemplateFormValues } from "~/features/templates/utils/template-mapping";

export const metadata: Metadata = {
  title: "New form"
};

export default function NewFormPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-heading-h1">New form</h1>
        <p className="text-mute">Name the form and list the fields the API should find in a document.</p>
      </header>
      <TemplateEditor initialValues={emptyTemplateFormValues()} mode="create" onSubmitAction={createTemplate} />
    </>
  );
}
