import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { Toaster, toast } from "@szum-tech/design-system";
import { expect, screen, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";

import { ActionToast } from "./action-toast";

const meta = preview.meta({
  beforeEach() {
    getRouter().replace.mockClear();
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
  title: "Features/Templates/Action Toast"
});

export const FormCreated = meta.story({
  args: { flag: "created" },
  name: "Form created",
  parameters: { nextjs: { navigation: { pathname: "/forms", query: { created: "1", q: "invoice" } } } }
});

FormCreated.test("Shows the toast once and drops the flag from the URL, keeping the search", async () => {
  await expect(await screen.findByText("Form created")).toBeVisible();
  await waitFor(() => expect(getRouter().replace).toHaveBeenCalledOnce());
  await expect(getRouter().replace).toHaveBeenCalledWith("/forms?q=invoice", { scroll: false });
  await expect(screen.getAllByText("Form created")).toHaveLength(1);
});

export const FormSaved = meta.story({
  args: { flag: "saved" },
  name: "Form saved",
  parameters: { nextjs: { navigation: { pathname: "/forms", query: { saved: "1" } } } }
});

FormSaved.test("Shows Form saved and goes back to the bare list URL", async () => {
  await expect(await screen.findByText("Form saved")).toBeVisible();
  await waitFor(() => expect(getRouter().replace).toHaveBeenCalledWith("/forms", { scroll: false }));
});

export const FormDeleted = meta.story({
  args: { flag: "deleted" },
  name: "Form deleted",
  parameters: { nextjs: { navigation: { pathname: "/forms", query: { deleted: "1" } } } }
});

FormDeleted.test("Shows Form deleted", async () => {
  await expect(await screen.findByText("Form deleted")).toBeVisible();
});

export const NoFlag = meta.story({
  args: { flag: null },
  name: "No flag",
  parameters: { nextjs: { navigation: { pathname: "/forms", query: {} } } }
});

NoFlag.test("Shows no toast and leaves the URL alone", async () => {
  await waitFor(() => expect(screen.queryByText(/^Form (created|saved|deleted)$/)).not.toBeInTheDocument());
  await expect(getRouter().replace).not.toHaveBeenCalled();
});
