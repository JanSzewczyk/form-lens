"use client";

import { toast } from "@szum-tech/design-system";
import { usePathname } from "next/navigation";
import * as React from "react";

import { readAndClearToastCookie } from "~/lib/toast/read-toast-cookie";
import { ToastType } from "~/lib/toast/types";

/**
 * Shows the toast a redirecting Server Action left in the toast cookie, once, and clears the cookie. It reads the
 * cookie after every navigation (`pathname`), which is when the redirect lands. Renders nothing.
 *
 * Client Component: it reads `document.cookie` and calls the toast library, both browser-only.
 */
export function ActionToast() {
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: the pathname is the trigger, the cookie is read after each navigation
  React.useEffect(() => {
    const message = readAndClearToastCookie();
    if (message === null) {
      return;
    }
    switch (message.type) {
      case ToastType.error:
        toast.error(message.message);
        break;
      case ToastType.info:
        toast.info(message.message);
        break;
      case ToastType.warning:
        toast.warning(message.message);
        break;
      default:
        toast.success(message.message);
    }
  }, [pathname]);

  return null;
}
