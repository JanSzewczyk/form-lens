import "server-only";

import { cookies } from "next/headers";

import { env } from "~/data/env/server";
import { TOAST_COOKIE_MAX_AGE, TOAST_COOKIE_NAME } from "~/lib/toast/constants";
import { type ToastMessage, ToastType } from "~/lib/toast/types";

/** Sets the one-shot toast cookie. Call it immediately before `redirect()`; the next page reads and clears it. */
export async function setToastCookie(message: string, type: ToastType = ToastType.success): Promise<void> {
  const cookieStore = await cookies();
  const payload: ToastMessage = { message, type };

  cookieStore.set(TOAST_COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: false,
    maxAge: TOAST_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production"
  });
}
