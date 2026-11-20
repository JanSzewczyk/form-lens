import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test as it } from "vitest";

import FormNotFound from "./not-found";

describe("Form not found page", () => {
  it("says in English that the form does not exist (AC21)", () => {
    const html = renderToStaticMarkup(<FormNotFound />);

    expect(html).toContain("Form not found");
    expect(html).toContain("This form does not exist");
  });

  it("links back to Forms (AC21)", () => {
    const html = renderToStaticMarkup(<FormNotFound />);

    expect(html).toMatch(/<a[^>]*href="\/forms"[^>]*>Back to Forms<\/a>/);
  });
});
