import { randomUUID } from "node:crypto";

import { type APIRequestContext, expect, test as it, type Page } from "@playwright/test";

/**
 * Happy paths of the Studio app shell: navigation, API status, and create → list → edit → delete of a form.
 *
 * The Studio reads `FORMLENS_API_URL` (default http://localhost:8000). The shell tests run with or without an API
 * (the status box shows whichever state the API is in). The form tests need a running API and skip themselves
 * without one. The CI workflow starts no API and runs no E2E, so run them by hand:
 *
 *     # apps/api: a throwaway database and a fake parser (no model needed), see scripts/run_schemathesis.sh
 *     DB_URL=sqlite:////tmp/e2e.db uv run python -m formlens migrate
 *     DB_URL=sqlite:////tmp/e2e.db uv run uvicorn --factory tests.schemathesis_app:create_schemathesis_app --port 8000
 *     # apps/studio
 *     SKIP_ENV_VALIDATION=1 npm run build
 *     FORMLENS_API_URL=http://127.0.0.1:8000 npm run test:e2e -- --project=chromium
 */

const API_URL = (process.env.FORMLENS_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const API_HOST = new URL(API_URL).host;

/** A name no stored form has, so the test finds its own card and removes only what it created. */
const FORM_NAME = `Invoice e2e ${randomUUID()}`;
const FORM_NAME_EDITED = `${FORM_NAME} edited`;

async function isApiReady(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(`${API_URL}/health/ready`, { timeout: 3000 });
    return response.status() === 200;
  } catch {
    return false;
  }
}

/** Removes every form this run named, whatever state a failed test left it in. */
async function deleteFormsCreatedByRun(request: APIRequestContext) {
  const response = await request.get(`${API_URL}/v1/templates`, { params: { limit: 100, search: FORM_NAME } });
  expect(response.ok()).toBe(true);
  const { items } = (await response.json()) as { items: Array<{ id: string }> };

  for (const { id } of items) {
    await request.delete(`${API_URL}/v1/templates/${id}`);
  }
}

/** Shows the form in the list: the search narrows the list to it, wherever the paging would put it. */
async function searchForm(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Search forms" }).fill(name);
  await page.getByRole("button", { exact: true, name: "Search" }).click();
  await expect(page).toHaveURL(/\/forms\?q=/);
}

it.describe("App shell", () => {
  it("marks the current section in the side navigation (AC1)", async ({ page }) => {
    await page.goto("/forms");

    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    await expect(navigation.getByRole("link", { name: "Forms" })).toHaveAttribute("aria-current", "page");
    await expect(navigation.getByRole("link", { name: "New document" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Jobs" })).toBeVisible();
    await expect(navigation.locator("[aria-current='page']")).toHaveCount(1);

    await navigation.getByRole("link", { name: "Jobs" }).click();

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(navigation.getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
    await expect(navigation.getByRole("link", { name: "Forms" })).not.toHaveAttribute("aria-current", "page");
  });

  it("shows the state and the address of the API in the status box (AC3)", async ({ page, request }) => {
    const isReady = await isApiReady(request);

    await page.goto("/forms");

    const status = page.getByRole("status").filter({ hasText: /^API (connected|unavailable)/ });
    await expect(status).toContainText(isReady ? "API connected" : "API unavailable");
    await expect(status).toContainText(API_HOST);
  });
});

it.describe("Forms", () => {
  // One browser runs the flow: the browsers would create and delete forms in the same API at the same time.
  it.describe.configure({ mode: "serial" });

  // Probed once: an API that goes away in the middle of the flow fails the test that needs it, it does not skip it.
  let hasApi = false;

  it.beforeAll(async ({ request }) => {
    hasApi = await isApiReady(request);
  });

  it.beforeEach(({ browserName }, testInfo) => {
    testInfo.skip(browserName !== "chromium", "the flow runs in one browser");
    testInfo.skip(!hasApi, `no API answers at ${API_URL}; the form flow is manual then`);
  });

  it.afterAll(async ({ request }) => {
    if (hasApi) {
      await deleteFormsCreatedByRun(request);
    }
  });

  it("creates a form and lists it (AC12)", async ({ page }) => {
    await page.goto("/forms");
    await page.getByRole("link", { name: "New form" }).first().click();
    await expect(page).toHaveURL(/\/forms\/new$/);

    await page.getByLabel("Name", { exact: true }).fill(FORM_NAME);
    await page.getByRole("button", { name: "Add first field" }).click();
    await page.getByLabel("Key of field 1").fill("invoice_number");
    await page.getByLabel("Description of field 1").fill("The number printed at the top of the invoice");
    await page.getByRole("button", { name: "Create form" }).click();

    await expect(page).toHaveURL(/\/forms(\?.*)?$/);
    await expect(page.getByText("Form created")).toBeVisible();

    await searchForm(page, FORM_NAME);
    const card = page.getByRole("listitem").filter({ hasText: FORM_NAME });
    await expect(card).toContainText("1 field");
    await expect(card).toContainText("Never used");
  });

  it("edits the form and lists the new data (AC18)", async ({ page }) => {
    await page.goto(`/forms?q=${encodeURIComponent(FORM_NAME)}`);
    await page.getByRole("link", { name: `Edit ${FORM_NAME}` }).click();

    await expect(page.getByRole("heading", { name: "Edit form" })).toBeVisible();
    await expect(page.getByText("Version 1.")).toBeVisible();
    await expect(page.getByLabel("Key of field 1")).toHaveValue("invoice_number");

    await page.getByLabel("Name", { exact: true }).fill(FORM_NAME_EDITED);
    await page.locator("#template-description").fill("Edited by the end-to-end test");
    await page.getByRole("button", { name: "Add field" }).click();
    await page.getByLabel("Key of field 2").fill("total");
    await page.getByRole("button", { name: "Save form" }).click();

    await expect(page).toHaveURL(/\/forms(\?.*)?$/);
    await expect(page.getByText("Form saved")).toBeVisible();

    await searchForm(page, FORM_NAME_EDITED);
    const card = page.getByRole("listitem").filter({ hasText: FORM_NAME_EDITED });
    await expect(card).toContainText("2 fields");
    await expect(card).toContainText("Edited by the end-to-end test");

    await page.getByRole("link", { name: `Edit ${FORM_NAME_EDITED}` }).click();
    await expect(page.getByText("Version 2.")).toBeVisible();
  });

  it("keeps the form when the delete is cancelled, removes it when confirmed (AC20)", async ({ page }) => {
    await page.goto(`/forms?q=${encodeURIComponent(FORM_NAME_EDITED)}`);
    await page.getByRole("link", { name: `Edit ${FORM_NAME_EDITED}` }).click();
    await expect(page.getByRole("heading", { name: "Edit form" })).toBeVisible();
    const editUrl = page.url();

    await page.getByRole("button", { exact: true, name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Delete this form?");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(editUrl);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(FORM_NAME_EDITED);

    await page.getByRole("button", { exact: true, name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete form" }).click();

    await expect(page).toHaveURL(/\/forms(\?.*)?$/);
    await expect(page.getByRole("heading", { level: 1, name: "Forms" })).toBeVisible();
    await expect(page.getByText("Form deleted")).toBeVisible();

    await page.goto(`/forms?q=${encodeURIComponent(FORM_NAME_EDITED)}`);
    await expect(page.getByText("No forms match your search")).toBeVisible();
  });
});
