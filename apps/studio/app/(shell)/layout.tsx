import { SidebarProvider } from "@szum-tech/design-system";
import * as React from "react";

import { ApiStatus, ApiStatusFallback } from "~/components/layout/api-status";
import { AppHeader } from "~/components/layout/app-header";
import { AppSidebar } from "~/components/layout/app-sidebar";

export default function ShellLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
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
