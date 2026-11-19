"use client";

import { SidebarTrigger, useSidebar } from "@szum-tech/design-system";

/**
 * The design system's trigger does not report its state. A client leaf because `aria-expanded` has to follow
 * `useSidebar()`: the desktop rail (`open`) or the mobile sheet (`openMobile`), whichever the viewport uses.
 */
export function SidebarToggle() {
  const { isMobile, open, openMobile } = useSidebar();

  return <SidebarTrigger aria-expanded={isMobile ? openMobile : open} />;
}
