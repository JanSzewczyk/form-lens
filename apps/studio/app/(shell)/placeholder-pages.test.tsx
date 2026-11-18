import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test as it } from "vitest";

import NewDocumentPage, { metadata as newDocumentMetadata } from "./documents/new/page";
import JobsPage, { metadata as jobsMetadata } from "./jobs/page";

describe("placeholder pages", () => {
  it("New document names its section and says it is coming soon", () => {
    const html = renderToStaticMarkup(<NewDocumentPage />);

    expect(html).toContain("New document");
    expect(html).toContain("Coming soon");
    expect(newDocumentMetadata.title).toBe("New document");
  });

  it("Jobs names its section and says it is coming soon", () => {
    const html = renderToStaticMarkup(<JobsPage />);

    expect(html).toContain("Jobs");
    expect(html).toContain("Coming soon");
    expect(jobsMetadata.title).toBe("Jobs");
  });

  it("each placeholder has one level-1 heading, the section name", () => {
    expect(renderToStaticMarkup(<JobsPage />).match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]).toBe("Jobs");
    expect(renderToStaticMarkup(<NewDocumentPage />).match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]).toBe("New document");
  });
});
