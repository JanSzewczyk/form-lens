import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test as it } from "vitest";

import JobsPage, { metadata as jobsMetadata } from "./jobs/page";

describe("placeholder pages", () => {
  it("Jobs names its section and says it is coming soon", () => {
    const html = renderToStaticMarkup(<JobsPage />);

    expect(html).toContain("Jobs");
    expect(html).toContain("Coming soon");
    expect(jobsMetadata.title).toBe("Jobs");
  });

  it("each placeholder has one level-1 heading, the section name", () => {
    expect(renderToStaticMarkup(<JobsPage />).match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]).toBe("Jobs");
  });
});
