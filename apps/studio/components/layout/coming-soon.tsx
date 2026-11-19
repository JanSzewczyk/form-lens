import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@szum-tech/design-system";

type ComingSoonProps = {
  /** The section name, shown as the page heading. */
  section: string;
  description: string;
};

export function ComingSoon({ section, description }: ComingSoonProps) {
  return (
    <>
      <h1 className="text-heading-h1">{section}</h1>
      <Empty border="dashed">
        <EmptyHeader>
          <EmptyTitle className="text-heading-h3">Coming soon</EmptyTitle>
          <EmptyDescription className="text-mute">{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
