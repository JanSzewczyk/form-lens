"use client";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@szum-tech/design-system";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isCurrentSection, NAV_ITEMS } from "./nav-items";

/**
 * The section links. A client leaf because the current section comes from `usePathname`, and because a tap on a
 * link must close the mobile sheet (the layout, and so the sheet, survives navigation).
 */
export function SidebarNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <nav aria-label="Main navigation">
      <SidebarMenu>
        {NAV_ITEMS.map((item) => {
          const isCurrent = isCurrentSection(pathname, item.href);
          const Icon = item.icon;

          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                className="h-11 gap-3 px-3 data-[active=true]:font-semibold"
                isActive={isCurrent}
                tooltip={item.label}
              >
                <Link
                  aria-current={isCurrent ? "page" : undefined}
                  href={item.href}
                  onClick={() => setOpenMobile(false)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
