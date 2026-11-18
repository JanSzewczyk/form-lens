import type { Metadata } from "next";
import { ComingSoon } from "~/components/layout/coming-soon";

export const metadata: Metadata = {
  title: "Jobs"
};

export default function JobsPage() {
  return <ComingSoon description="Tracking extraction jobs is not available yet." section="Jobs" />;
}
