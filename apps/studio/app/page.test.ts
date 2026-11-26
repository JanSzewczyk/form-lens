import { describe, expect, test as it } from "vitest";

import Home from "./page";

/** Next.js redirects by throwing an error whose digest names the target: `NEXT_REDIRECT;<type>;<url>;<status>;`. */
function catchRedirect(run: () => unknown): { digest: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && "digest" in error && typeof error.digest === "string") {
      return { digest: error.digest };
    }
    throw error;
  }
  throw new Error("Expected a redirect, but the page rendered");
}

describe("/ (Home)", () => {
  it("redirects to /forms", () => {
    const { digest } = catchRedirect(() => Home());

    expect(digest).toMatch(/^NEXT_REDIRECT;/);
    expect(digest.split(";")[2]).toBe("/forms");
  });
});
