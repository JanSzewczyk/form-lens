import { TOAST_COOKIE_NAME } from "~/lib/toast/constants";
import { type ToastMessage, ToastType } from "~/lib/toast/types";

const TOAST_TYPES: ReadonlyArray<string> = Object.values(ToastType);

function isToastMessage(value: unknown): value is ToastMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    "type" in value &&
    typeof value.type === "string" &&
    TOAST_TYPES.includes(value.type)
  );
}

/** Reads the toast cookie and clears it first, so the toast fires once even if parsing fails. Browser only. */
export function readAndClearToastCookie(): ToastMessage | null {
  const row = document.cookie.split("; ").find((entry) => entry.startsWith(`${TOAST_COOKIE_NAME}=`));
  if (row === undefined) {
    return null;
  }
  document.cookie = `${TOAST_COOKIE_NAME}=; Max-Age=0; path=/`;

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(row.slice(TOAST_COOKIE_NAME.length + 1)));
    return isToastMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
