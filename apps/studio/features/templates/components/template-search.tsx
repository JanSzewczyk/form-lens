import { Button, Input } from "@szum-tech/design-system";
import { SearchIcon } from "lucide-react";

type TemplateSearchProps = {
  /** The current search, so the box keeps what the user typed after the page reloads. */
  search: string;
};

/** A plain GET form: submitting it loads `/forms?q=...`, which also starts again from the first page. */
export function TemplateSearch({ search }: TemplateSearchProps) {
  return (
    <form action="/forms" className="flex w-full max-w-[380px] gap-2" method="get" role="search">
      <Input
        aria-label="Search forms"
        defaultValue={search}
        maxLength={100}
        name="q"
        placeholder="Search forms"
        type="search"
      />
      <Button startIcon={<SearchIcon aria-hidden />} type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
