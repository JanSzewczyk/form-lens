import { Header, Separator, SidebarTrigger } from "@szum-tech/design-system";

import { ThemeToggle } from "~/components/ui/theme-toggle";

import { AppBreadcrumbs } from "./app-breadcrumbs";

export function AppHeader() {
  return (
    <Header variant="full">
      <div className="flex w-full min-w-0 items-center gap-3">
        <SidebarTrigger />
        <Separator
          className="data-[orientation=vertical]:h-auto data-[orientation=vertical]:self-stretch"
          orientation="vertical"
        />
        <AppBreadcrumbs />
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </Header>
  );
}
