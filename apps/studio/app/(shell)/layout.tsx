import { SidebarProvider } from "@szum-tech/design-system";
import * as React from "react";

import { ApiStatus, ApiStatusFallback } from "~/components/layout/api-status";
import { AppHeader } from "~/components/layout/app-header";
import { AppSidebar } from "~/components/layout/app-sidebar";

/** The design's aside is 248 px (15.5rem); the mobile sheet keeps the design system's own width. */
const SHELL_STYLE = { "--sidebar-width": "15.5rem" } as React.CSSProperties;

export default function ShellLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider style={SHELL_STYLE}>
      <AppSidebar
        status={
          <React.Suspense fallback={<ApiStatusFallback />}>
            <ApiStatus />
          </React.Suspense>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex min-w-0 flex-1 flex-col gap-7 px-4 pt-8 pb-14 md:px-10" id="main-content">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
