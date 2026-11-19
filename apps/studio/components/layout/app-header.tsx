import { Header, Separator } from "@szum-tech/design-system";

import { ThemeToggle } from "~/components/ui/theme-toggle";

import { AppBreadcrumbs } from "./app-breadcrumbs";
import { SidebarToggle } from "./sidebar-toggle";

export function AppHeader() {
  return (
    <Header variant="full">
      <div className="flex w-full min-w-0 items-center gap-3">
        <SidebarToggle />
        <Separator className="data-[orientation=vertical]:h-5" orientation="vertical" />
        <AppBreadcrumbs />
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </Header>
  );
}
