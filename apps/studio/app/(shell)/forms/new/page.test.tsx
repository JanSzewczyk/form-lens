import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test as it } from "vitest";

import NewFormPage, { metadata } from "./page";

describe("New form page", () => {
  it("has the title New form and one level-1 heading", () => {
    const html = renderToStaticMarkup(<NewFormPage />);

    expect(metadata.title).toBe("New form");
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain(">New form</h1>");
  });

  it("opens an empty create form: no fields, a Create form button and no Delete (AC12, AC13)", () => {
    const html = renderToStaticMarkup(<NewFormPage />);

    expect(html).toContain("No fields yet");
    expect(html).toContain("Create form");
    expect(html).not.toContain("Save form");
    expect(html).not.toContain(">Delete<");
  });
});
