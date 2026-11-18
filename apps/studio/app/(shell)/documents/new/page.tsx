import type { Metadata } from "next";
import { ComingSoon } from "~/components/layout/coming-soon";

export const metadata: Metadata = {
  title: "New document"
};

export default function NewDocumentPage() {
  return (
    <ComingSoon description="Uploading a document to read with a form is not available yet." section="New document" />
  );
}
