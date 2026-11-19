import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@szum-tech/design-system";

import type { TemplateFieldValues } from "~/features/templates/schemas/template-form-schema";
import { buildResponsePreview } from "~/features/templates/utils/template-mapping";

interface ResponsePreviewProps {
  fields: ReadonlyArray<Pick<TemplateFieldValues, "key" | "type">>;
}

export function ResponsePreview({ fields }: ResponsePreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-h3">API response preview</CardTitle>
        <CardDescription>The keys of an extraction result, in this order, with the type of each value.</CardDescription>
      </CardHeader>
      <CardContent>
        <pre
          aria-label="Preview of the API response"
          className="text-code bg-muted font-code overflow-x-auto rounded-md p-4 whitespace-pre"
          data-testid="response-preview"
        >
          {buildResponsePreview(fields)}
        </pre>
      </CardContent>
    </Card>
  );
}
