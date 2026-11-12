import { expect, test as it } from "@playwright/test";

it("has the Studio title and heading", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/FormLens Studio/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("FormLens");
});

it("shows the templates or says the API is not available", async ({ page }) => {
  await page.goto("/");

  // CI runs the Studio without the API, so either state is a working page.
  const templates = page.getByRole("heading", { name: /form templates/i });
  const unavailable = page.getByRole("status");
  await expect(templates.or(unavailable)).toBeVisible();
});
