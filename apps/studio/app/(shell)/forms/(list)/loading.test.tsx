import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test as it } from "vitest";

import FormsLoading from "./loading";

describe("Forms list loading state", () => {
  it("is announced as a busy status named Loading forms", () => {
    const html = renderToStaticMarkup(<FormsLoading />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading forms"');
  });
});
