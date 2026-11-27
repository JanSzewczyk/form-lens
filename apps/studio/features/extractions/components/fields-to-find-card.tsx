import type { TemplateResponse } from "@form-lens/api-client";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@szum-tech/design-system";

type FieldsToFindCardProps = {
  template: Pick<TemplateResponse, "name" | "fields">;
};

/** The keys the API will look for, in the order of the form, each with its type. */
export function FieldsToFindCard({ template }: FieldsToFindCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-h4">Fields to find</CardTitle>
        <CardDescription>From the “{template.name}” form</CardDescription>
      </CardHeader>
      <CardContent>
        <ul aria-label="Fields to find" className="flex flex-col gap-3">
          {template.fields.map((field) => (
            <li className="flex min-w-0 items-center justify-between gap-3" key={field.name}>
              <span className="text-code min-w-0 break-all">{field.name}</span>
              <Badge variant="outline">{field.type}</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
