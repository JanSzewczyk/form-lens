import type { TemplateResponse } from "@form-lens/api-client";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@szum-tech/design-system";

interface TemplateListProps {
  templates: Array<TemplateResponse>;
  total: number;
}

export function TemplateList({ templates, total }: TemplateListProps) {
  if (templates.length === 0) {
    return <p className="text-muted-foreground">No form templates yet. Create one with the FormLens API.</p>;
  }

  return (
    <section aria-labelledby="templates-heading">
      <h2 className="text-heading-h2 mb-6" id="templates-heading">
        Form templates <Badge variant="secondary">{total}</Badge>
      </h2>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <li key={template.id}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-heading-h3">{template.name}</CardTitle>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {template.fields.length} {template.fields.length === 1 ? "field" : "fields"}
                </Badge>
                <Badge variant="outline">v{template.version}</Badge>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
