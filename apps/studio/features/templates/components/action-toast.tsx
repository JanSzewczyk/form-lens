"use client";

import { toast } from "@szum-tech/design-system";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

export type ActionToastFlag = "created" | "saved" | "deleted";

const MESSAGES: Record<ActionToastFlag, string> = {
  created: "Form created",
  deleted: "Form deleted",
  saved: "Form saved"
};

type ActionToastProps = {
  /** The outcome the previous page redirected with (`?created=1`, `?saved=1` or `?deleted=1`), if any. */
  flag: ActionToastFlag | null;
};

/**
 * Shows the toast of a redirecting action once, then drops the flag from the URL so a reload does not repeat it.
 * Renders nothing.
 */
export function ActionToast({ flag }: ActionToastProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handledFlag = React.useRef<ActionToastFlag | null>(null);

  React.useEffect(() => {
    if (flag === null) {
      handledFlag.current = null;
      return;
    }
    if (handledFlag.current === flag) {
      return;
    }
    handledFlag.current = flag;
    // The ref stops a second run (strict mode, a changed query); the fixed id also keeps sonner to one toast.
    toast.success(MESSAGES[flag], { id: `forms-${flag}` });

    const params = new URLSearchParams(searchParams.toString());
    params.delete(flag);
    const query = params.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
  }, [flag, pathname, router, searchParams]);

  return null;
}
