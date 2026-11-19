import { Skeleton } from "@szum-tech/design-system";

const PLACEHOLDER_IDS = ["a", "b", "c", "d", "e", "f"];

export default function FormsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading forms" className="flex flex-col gap-7" role="status">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-10 w-full max-w-[380px]" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-6">
        {PLACEHOLDER_IDS.map((id) => (
          <Skeleton className="h-52" key={id} />
        ))}
      </div>
    </div>
  );
}
