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

/**
 * The ids a server render puts into the field rows must be the same on every render, or the browser's render
 * differs from the server's (a hydration mismatch). Two requests of the page are compared, which a random id fails.
 */
async function expectStableRowIds(page: Page) {
  async function readRowIds() {
    const html = await (await page.request.get(page.url())).text();
    return [...html.matchAll(/data-slot="sortable-item"[^>]*/g)].map(([tag]) => ({
      describedBy: /aria-describedby="([^"]*)"/.exec(tag)?.[1],
      value: /data-value="([^"]*)"/.exec(tag)?.[1]
    }));
  }

  const first = await readRowIds();
  const second = await readRowIds();

  expect(first.length).toBeGreaterThan(0);
  expect(second).toEqual(first);
  expect(JSON.stringify(first)).not.toContain("DndDescribedBy");
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

it.describe("Theme and phone width", () => {
  it("keeps the theme the user chose after a reload (AC5)", async ({ page }) => {
    await page.goto("/forms");
    const toggle = page.getByRole("button", { name: /Click to switch to/ });

    // system -> light -> dark
    await toggle.click();
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    await page.reload();

    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.getByRole("button", { name: /Current: Dark theme/ })).toBeVisible();
  });

  it("has no horizontal scroll on /forms at a phone width of 375 px (AC24)", async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 375 });
    await page.goto("/forms");
    await expect(page.getByRole("heading", { level: 1, name: "Forms" })).toBeVisible();

    const { clientWidth, scrollWidth } = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  it("collapses the navigation at a phone width (AC24)", async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 375 });
    await page.goto("/forms");

    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
  });
});

/**
 * A refused submit must show its message at once. This runs against the production build on purpose: the React
 * Compiler memoized the field rows so that they showed the message only after the next edit, and the Storybook tests,
 * which do not run the compiler, passed all the time. The editor needs no API until the form is valid.
 */
it.describe("Form editor refuses a submit with a message at once (AC13, AC14, AC15)", () => {
  async function addFieldWithKey(page: Page, number: number, key: string) {
    await page.getByRole("button", { name: number === 1 ? "Add first field" : "Add field" }).click();
    await page.getByLabel(`Key of field ${number}`).fill(key);
  }

  it.beforeEach(async ({ page }) => {
    await page.goto("/forms/new");
    await page.getByLabel("Name", { exact: true }).fill("Invoice");
  });

  it("names the duplicate key and focuses it (AC14)", async ({ page }) => {
    await addFieldWithKey(page, 1, "total");
    await addFieldWithKey(page, 2, "total");

    await page.getByRole("button", { name: "Create form" }).click();

    await expect(page.getByText("This key is already used by another field")).toBeVisible();
    await expect(page.getByLabel("Key of field 2")).toBeFocused();
    await expect(page).toHaveURL(/\/forms\/new$/);
  });

  it("points at a choice field with no allowed values (AC15)", async ({ page }) => {
    await addFieldWithKey(page, 1, "status");
    await page.getByRole("combobox", { name: "Type of field 1" }).click();
    await page.getByRole("option", { name: "Choice" }).click();

    await page.getByRole("button", { name: "Create form" }).click();

    await expect(page.getByText("Add at least one allowed value")).toBeVisible();
  });

  it("points at a key that breaks the format, and follows the key as it is corrected", async ({ page }) => {
    await addFieldWithKey(page, 1, "Bad Key");

    await page.getByRole("button", { name: "Create form" }).click();

    await expect(page.getByText(/Use lower case letters/)).toBeVisible();
    await page.getByLabel("Key of field 1").fill("good_key");
    await expect(page.getByText(/Use lower case letters/)).toBeHidden();
  });

  it("points at a minimum above the maximum", async ({ page }) => {
    await addFieldWithKey(page, 1, "amount");
    await page.getByRole("combobox", { name: "Type of field 1" }).click();
    await page.getByRole("option", { exact: true, name: "Number" }).click();
    await page.getByRole("button", { name: "Advanced" }).last().click();
    await page.getByLabel("Minimum of field 1").fill("9");
    await page.getByLabel("Maximum of field 1").fill("5");

    await page.getByRole("button", { name: "Create form" }).click();

    await expect(page.getByText("The minimum is above the maximum")).toBeVisible();
  });

  it("points at a missing key, then shows the next refusal and not the previous one", async ({ page }) => {
    await page.getByRole("button", { name: "Add first field" }).click();
    await page.getByRole("button", { name: "Create form" }).click();
    await expect(page.getByText("Enter a key for this field")).toBeVisible();

    await page.getByLabel("Key of field 1").fill("total");
    await page.getByRole("button", { name: "Add field" }).click();
    await page.getByLabel("Key of field 2").fill("total");
    await page.getByRole("button", { name: "Create form" }).click();

    await expect(page.getByText("This key is already used by another field")).toBeVisible();
    await expect(page.getByText("Enter a key for this field")).toBeHidden();
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

  it("answers 404 with the not-found page for a form that does not exist (AC21)", async ({ page }) => {
    const response = await page.goto(`/forms/${randomUUID()}/edit`);

    expect(response?.status()).toBe(404);
    await expect(page.getByText("Form not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Forms" })).toHaveAttribute("href", "/forms");
  });

  it("shows the message of the API, and drops it when the next submit is refused here (AC19)", async ({ page }) => {
    await page.goto("/forms/new");
    await page.getByLabel("Name", { exact: true }).fill(`${FORM_NAME} rejected`);
    await page.getByRole("button", { name: "Add first field" }).click();
    await page.getByLabel("Key of field 1").fill("code");
    await page.getByRole("button", { name: "Advanced" }).last().click();
    // The API compiles the pattern; the editor only checks its length, so this reaches the API and comes back as a 422.
    await page.getByLabel("Pattern of field 1").fill("(");
    await page.getByRole("button", { name: "Create form" }).click();

    const banner = page.getByRole("alert").filter({ hasText: /The API rejected the form/ });
    await expect(banner).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(`${FORM_NAME} rejected`);

    await page.getByLabel("Name", { exact: true }).fill("");
    await page.getByRole("button", { name: "Create form" }).click();

    await expect(page.getByText("Enter a name for the form")).toBeVisible();
    await expect(banner).toBeHidden();
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
    await expectStableRowIds(page);

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

it.describe("Loading skeleton of the forms list", () => {
  const SKELETON_LABEL = "Loading forms";

  it("is part of the /forms response, as a control that the check below can fail", async ({ request }) => {
    const html = await (await request.get("/forms")).text();

    expect(html).toContain(`aria-label="${SKELETON_LABEL}"`);
  });

  it("is not part of the /forms/new response", async ({ request }) => {
    const response = await request.get("/forms/new");

    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain(`aria-label="${SKELETON_LABEL}"`);
  });
});
