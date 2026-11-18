import type { Metadata } from "next";
import { TemplateList } from "~/features/templates/components/template-list";
import { loadTemplates } from "~/features/templates/server/load-templates";

export const metadata: Metadata = {
  title: "Forms"
};

// The list comes from the API at request time; the build must not need the API.
export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const result = await loadTemplates();

  return (
    <>
      <h1 className="text-heading-h1">Forms</h1>
      {result.status === "ok" ? (
        <TemplateList templates={result.templates} total={result.total} />
      ) : (
        <p className="text-mute" role="status">
          The FormLens API is not available: {result.reason}
        </p>
      )}
    </>
  );
}
