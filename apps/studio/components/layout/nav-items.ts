import { ActivityIcon, ListIcon, type LucideIcon, UploadIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: Array<NavItem> = [
  { href: "/forms", icon: ListIcon, label: "Forms" },
  { href: "/documents/new", icon: UploadIcon, label: "New document" },
  { href: "/jobs", icon: ActivityIcon, label: "Jobs" }
];

/** A section is current for its own path and everything below it, so `/forms/new` still marks Forms. */
export function isCurrentSection(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
