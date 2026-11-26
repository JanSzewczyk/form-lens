"use client";

import { Tooltip, TooltipContent, TooltipTrigger, useSidebar } from "@szum-tech/design-system";
import type * as React from "react";

type RailTooltipProps = {
  /** The single element that gets the tooltip; it must accept a ref and DOM props. */
  children: React.ReactElement;
  /** What the tooltip shows. */
  label: React.ReactNode;
};

/** A tooltip that shows only in the collapsed icon rail, like the `tooltip` of `SidebarMenuButton`. */
export function RailTooltip({ children, label }: RailTooltipProps) {
  const { isMobile, state } = useSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent align="center" hidden={state !== "collapsed" || isMobile} side="right">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
