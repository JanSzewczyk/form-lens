import { Header } from "@szum-tech/design-system";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import { TemplateList } from "~/features/templates/components/template-list";
import { loadTemplates } from "~/features/templates/server/load-templates";

// The list comes from the API at request time; the build must not need the API.
export const dynamic = "force-dynamic";

export default async function Home() {
  const result = await loadTemplates();

  return (
    <div className="flex min-h-screen flex-col">
      <Header>
        <div className="flex w-full items-center justify-between">
          <span className="text-body-sm font-semibold">FormLens Studio</span>
          <ThemeToggle />
        </div>
      </Header>
      <main className="container flex-1 py-12" id="main-content">
        <h1 className="text-display-lg mb-2">
          <span className="text-primary">FormLens</span> Studio
        </h1>
        <p className="text-lead mb-10 max-w-2xl">
          Work with the form templates and extractions of the FormLens API, which reads documents with models that run
          locally.
        </p>
        {result.status === "ok" ? (
          <TemplateList templates={result.templates} total={result.total} />
        ) : (
          <p className="text-muted-foreground" role="status">
            The FormLens API is not available: {result.reason}
          </p>
        )}
      </main>
    </div>
  );
}
