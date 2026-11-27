"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@szum-tech/design-system";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { isCurrentSection, NAV_ITEMS } from "./nav-items";

type Crumb = { href: string; label: string };

const EDIT_FORM_PATH = /^\/forms\/[^/]+\/edit$/;
const JOB_PATH = /^\/jobs\/([^/]+)$/;

function getCrumbs(pathname: string): Array<Crumb> {
  const section = NAV_ITEMS.find((item) => isCurrentSection(pathname, item.href));
  if (!section) {
    return [];
  }

  const crumbs: Array<Crumb> = [{ href: section.href, label: section.label }];
  if (pathname === "/forms/new") {
    crumbs.push({ href: pathname, label: "New form" });
  } else if (EDIT_FORM_PATH.test(pathname)) {
    crumbs.push({ href: pathname, label: "Edit form" });
  } else {
    const jobId = JOB_PATH.exec(pathname)?.[1];
    if (jobId !== undefined) {
      crumbs.push({ href: pathname, label: jobId });
    }
  }
  return crumbs;
}

/** A client leaf: the shell layout does not know which page it wraps, so the trail comes from `usePathname`. */
export function AppBreadcrumbs() {
  const crumbs = getCrumbs(usePathname());

  return (
    <Breadcrumb aria-label="Breadcrumb" className="min-w-0">
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <React.Fragment key={crumb.href}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
