import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader } from "@szum-tech/design-system";
import { FileTextIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import { SidebarNav } from "./sidebar-nav";

type AppSidebarProps = {
  /** The API status box. The layout passes it in so this component never imports the async Server Component. */
  status: React.ReactNode;
};

export function AppSidebar({ status }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <Link className="flex items-center gap-3 rounded group-data-[collapsible=icon]:justify-center" href="/forms">
          <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded">
            <FileTextIcon aria-hidden="true" className="size-5" />
          </span>
          <span className="text-heading-h4 font-bold group-data-[collapsible=icon]:hidden">Form Lens</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarNav />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 group-data-[collapsible=icon]:p-2">{status}</SidebarFooter>
    </Sidebar>
  );
}
