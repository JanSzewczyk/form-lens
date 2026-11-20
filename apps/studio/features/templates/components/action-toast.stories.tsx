import { Toaster, toast } from "@szum-tech/design-system";
import { expect, screen, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";
import { TOAST_COOKIE_NAME } from "~/lib/toast/constants";
import { type ToastMessage, ToastType } from "~/lib/toast/types";

import { ActionToast } from "./action-toast";

function leaveToastCookie(payload: ToastMessage) {
  document.cookie = `${TOAST_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(payload))}; path=/`;
}

function hasToastCookie() {
  return document.cookie.split("; ").some((entry) => entry.startsWith(`${TOAST_COOKIE_NAME}=`));
}

const meta = preview.meta({
  beforeEach() {
    document.cookie = `${TOAST_COOKIE_NAME}=; Max-Age=0; path=/`;
    // sonner keeps its toasts in a module-level store, so one from the previous story would still be on screen.
    toast.dismiss();
  },
  component: ActionToast,
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    )
  ],
  parameters: { nextjs: { navigation: { pathname: "/forms" } } },
  title: "Features/Templates/Action Toast"
});

export const FormCreated = meta.story({
  beforeEach() {
    leaveToastCookie({ message: "Form created", type: ToastType.success });
  },
  name: "Form created"
});

FormCreated.test("Shows the toast of the cookie once and clears the cookie", async () => {
  await expect(await screen.findByText("Form created")).toBeVisible();
  await expect(screen.getAllByText("Form created")).toHaveLength(1);
  await expect(hasToastCookie()).toBe(false);
});

export const FormDeleted = meta.story({
  beforeEach() {
    leaveToastCookie({ message: "Form deleted", type: ToastType.success });
  },
  name: "Form deleted"
});

FormDeleted.test("Shows the message the action wrote", async () => {
  await expect(await screen.findByText("Form deleted")).toBeVisible();
});

export const UnreadableCookie = meta.story({
  beforeEach() {
    document.cookie = `${TOAST_COOKIE_NAME}=${encodeURIComponent("{not json")}; path=/`;
  },
  name: "Unreadable cookie"
});

UnreadableCookie.test("Shows no toast for a cookie that is not a toast, and clears it", async () => {
  await waitFor(() => expect(hasToastCookie()).toBe(false));
  await expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

export const NoCookie = meta.story({ name: "No cookie" });

NoCookie.test("Shows no toast", async () => {
  await waitFor(() => expect(screen.queryByText(/^Form (created|saved|deleted)$/)).not.toBeInTheDocument());
});
