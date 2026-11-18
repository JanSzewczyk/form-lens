import { SidebarProvider } from "@szum-tech/design-system";
import type * as React from "react";
import { expect, screen, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";

import { ApiStatusLive } from "./api-status-live";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

const SHELL_STYLE = { "--sidebar-width": "15.5rem" } as React.CSSProperties;
const PHONE_WIDTH = 375;

/** The breadcrumb repeats the section name, so the main navigation's own link is looked up inside its navigation. */
function mainNavLink(canvasElement: HTMLElement, name: string): HTMLElement {
  const links = canvasElement.querySelectorAll<HTMLElement>('nav[aria-label="Main navigation"] a');
  const link = Array.from(links).find((anchor) => anchor.textContent === name);
  if (!link) {
    throw new Error(`No "${name}" link in the main navigation`);
  }
  return link;
}

const meta = preview.meta({
  args: {
    status: <ApiStatusLive initial={{ host: "localhost:8000", status: "connected" }} />
  },
  component: AppSidebar,
  decorators: [
    (Story) => (
      <SidebarProvider style={SHELL_STYLE}>
        <Story />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="p-8" id="main-content">
            Page content
          </main>
        </div>
      </SidebarProvider>
    )
  ],
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/forms" } }
  },
  title: "Components/Layout/App Sidebar"
});

export const FormsSection = meta.story({ name: "Forms section" });

FormsSection.test("Lists Forms, New document and Jobs in the main navigation", async ({ canvas, canvasElement }) => {
  const nav = canvas.getByRole("navigation", { name: /main navigation/i });

  await expect(nav).toBeVisible();
  await expect(mainNavLink(canvasElement, "Forms")).toHaveAttribute("href", "/forms");
  await expect(mainNavLink(canvasElement, "New document")).toHaveAttribute("href", "/documents/new");
  await expect(mainNavLink(canvasElement, "Jobs")).toHaveAttribute("href", "/jobs");
});

FormsSection.test("Marks only the current section with aria-current", async ({ canvasElement }) => {
  await expect(mainNavLink(canvasElement, "Forms")).toHaveAttribute("aria-current", "page");
  await expect(mainNavLink(canvasElement, "New document")).not.toHaveAttribute("aria-current");
  await expect(mainNavLink(canvasElement, "Jobs")).not.toHaveAttribute("aria-current");
});

FormsSection.test("Shows the API status box in the footer", async ({ canvas }) => {
  await expect(canvas.getByText("API connected")).toBeVisible();
  await expect(canvas.getByText("localhost:8000")).toBeVisible();
});

FormsSection.test(
  "The toggle reports expanded, collapses the sidebar and expands it again",
  async ({ canvas, canvasElement, userEvent }) => {
    const toggle = canvas.getByRole("button", { name: /toggle sidebar/i });
    const sidebar = canvasElement.querySelector('[data-slot="sidebar"]');

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar).toHaveAttribute("data-state", "expanded");

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
  }
);

FormsSection.test("The breadcrumb names the current section", async ({ canvas }) => {
  const breadcrumb = canvas.getByRole("navigation", { name: /breadcrumb/i });

  await expect(breadcrumb).toHaveTextContent("Forms");
});

export const NestedFormsRoute = FormsSection.extend({
  name: "Nested forms route",
  parameters: { nextjs: { navigation: { pathname: "/forms/new" } } }
});

NestedFormsRoute.test(
  "Keeps Forms current below its path and adds the page to the breadcrumb",
  async ({ canvas, canvasElement }) => {
    await expect(mainNavLink(canvasElement, "Forms")).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("navigation", { name: /breadcrumb/i })).toHaveTextContent("New form");
  }
);

export const NewDocumentSection = FormsSection.extend({
  name: "New document section",
  parameters: { nextjs: { navigation: { pathname: "/documents/new" } } }
});

NewDocumentSection.test("Marks New document as current and not Forms", async ({ canvasElement }) => {
  await expect(mainNavLink(canvasElement, "New document")).toHaveAttribute("aria-current", "page");
  await expect(mainNavLink(canvasElement, "Forms")).not.toHaveAttribute("aria-current");
});

export const JobsSection = FormsSection.extend({
  name: "Jobs section",
  parameters: { nextjs: { navigation: { pathname: "/jobs" } } }
});

JobsSection.test("Marks Jobs as current", async ({ canvasElement }) => {
  await expect(mainNavLink(canvasElement, "Jobs")).toHaveAttribute("aria-current", "page");
  await expect(mainNavLink(canvasElement, "Forms")).not.toHaveAttribute("aria-current");
});

/**
 * The design system decides "phone" from `window.innerWidth` (under 768 px), and a story cannot resize the browser,
 * so this story reports a phone width for its own run.
 */
export const PhoneWidth = FormsSection.extend({
  beforeEach: () => {
    const desktopWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: PHONE_WIDTH });

    return () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: desktopWidth });
    };
  },
  name: "Phone width"
});

PhoneWidth.test("Hides the navigation until the toggle opens it as a sheet", async ({ canvas, userEvent }) => {
  const toggle = await canvas.findByRole("button", { name: /toggle sidebar/i });

  await expect(canvas.queryByRole("link", { name: "Jobs" })).not.toBeInTheDocument();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await userEvent.click(toggle);

  const dialog = await screen.findByRole("dialog");
  await expect(dialog).toBeInTheDocument();
  await expect(screen.getByRole("link", { name: "Forms" })).toHaveAttribute("aria-current", "page");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

PhoneWidth.test("Closes the sheet when a link is chosen", async ({ canvas, userEvent }) => {
  await userEvent.click(await canvas.findByRole("button", { name: /toggle sidebar/i }));
  await userEvent.click(await screen.findByRole("link", { name: "Jobs" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

FormsSection.test("Lists exactly three sections, in the design's order", async ({ canvasElement }) => {
  const links = canvasElement.querySelectorAll('nav[aria-label="Main navigation"] a');

  await expect(Array.from(links).map((link) => link.textContent)).toEqual(["Forms", "New document", "Jobs"]);
});

FormsSection.test("Shows the Form Lens logo as a link to Forms", async ({ canvas }) => {
  await expect(canvas.getByRole("link", { name: /form lens/i })).toHaveAttribute("href", "/forms");
});

FormsSection.test(
  "Hides the navigation off screen when collapsed and brings it back",
  async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole("button", { name: /toggle sidebar/i });
    const nav = canvas.getByRole("navigation", { name: /main navigation/i });

    await userEvent.click(toggle);
    await waitFor(() => expect(nav.getBoundingClientRect().right).toBeLessThanOrEqual(0));

    await userEvent.click(toggle);
    await waitFor(() => expect(nav.getBoundingClientRect().left).toBeGreaterThanOrEqual(0));
    await expect(nav).toBeVisible();
  }
);

export const OutsideEverySection = FormsSection.extend({
  name: "Outside every section",
  parameters: { nextjs: { navigation: { pathname: "/" } } }
});

OutsideEverySection.test("Marks no section as current", async ({ canvasElement }) => {
  await expect(canvasElement.querySelectorAll('nav[aria-label="Main navigation"] a[aria-current]')).toHaveLength(0);
});

export const SiblingOfAnAddressedSection = FormsSection.extend({
  name: "Sibling path of Forms",
  parameters: { nextjs: { navigation: { pathname: "/formsets" } } }
});

SiblingOfAnAddressedSection.test(
  "Does not mark Forms current for a path that only starts with it",
  async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('nav[aria-label="Main navigation"] a[aria-current]')).toHaveLength(0);
  }
);
