import type { TemplateResponse } from "@form-lens/api-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@szum-tech/design-system";
import Link from "next/link";

type TemplateCardProps = {
  template: TemplateResponse;
  /** The moment "Last used" is counted back from; passed in so the text is the same in every render. */
  now: Date;
};

const DAY_MS = 86_400_000;

function formatLastUsed(lastUsedAt: string, now: Date): string {
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const days = Math.trunc((new Date(lastUsedAt).getTime() - now.getTime()) / DAY_MS);

  if (days >= 0) {
    return "today";
  }
  if (days > -30) {
    return formatter.format(days, "day");
  }
  if (days > -365) {
    return formatter.format(Math.round(days / 30), "month");
  }
  return formatter.format(Math.round(days / 365), "year");
}

export function TemplateCard({ template, now }: TemplateCardProps) {
  const fieldCount = template.fields.length;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-h3">{template.name}</CardTitle>
        <CardDescription>{template.description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col items-start gap-2">
        <Badge variant="secondary">{fieldCount === 1 ? "1 field" : `${fieldCount} fields`}</Badge>
        <p className="text-mute">
          {template.last_used_at === null ? "Never used" : `Last used ${formatLastUsed(template.last_used_at, now)}`}
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button asChild size="sm">
          <Link href="/documents/new">Use form</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link aria-label={`Edit ${template.name}`} href={`/forms/${template.id}/edit`}>
            Edit
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
