import type { TemplateResponse } from "@form-lens/api-client";
import {
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from "@szum-tech/design-system";
import { FileTextIcon } from "lucide-react";
import Link from "next/link";

type SelectedFormItemProps = {
  template: Pick<TemplateResponse, "name" | "fields">;
};

/** The form the document will be read against, with the way back to Choose form. */
export function SelectedFormItem({ template }: SelectedFormItemProps) {
  const fieldCount = template.fields.length;

  return (
    <Item variant="outline">
      <ItemMedia variant="icon">
        <FileTextIcon aria-hidden />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="break-words">{template.name}</ItemTitle>
        <ItemDescription>{fieldCount === 1 ? "1 field to find" : `${fieldCount} fields to find`}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button asChild size="sm" variant="ghost">
          <Link href="/documents/new">Change form</Link>
        </Button>
      </ItemActions>
    </Item>
  );
}
