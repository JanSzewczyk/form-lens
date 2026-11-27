import { randomUUID } from "node:crypto";

import { type APIRequestContext, expect, test as it } from "@playwright/test";

/**
 * Happy path of the new document flow: Use form on a Forms card → Upload → Start analysis → the status page follows
 * the extraction from pending to completed without a reload and lists the results in the order of the form.
 *
 * The test needs an API whose worker runs, with a fake parser and a fake extractor, and skips itself without one. The
 * schemathesis app that forms.e2e.ts documents keeps its worker off (extractions stay `pending`), so start the same app
 * with the worker on. The extractor sleeps 5 s while the job is `running`, longer than the Studio's 3 s poll, so the
 * page shows that state; its `values` must match `FIELDS` below. The CI workflow runs no E2E, so run it by hand:
 *
 *     # apps/api
 *     DB_URL=sqlite:////tmp/e2e.db uv run python -m formlens migrate
 *     DB_URL=sqlite:////tmp/e2e.db uv run python -c "import time, uvicorn; from formlens.config import Settings; from formlens.main import create_app; from tests.fakes import FakeParser; from tests.extractions.fakes import FakeExtractor; uvicorn.run(create_app(Settings(), parser_factory=lambda _: FakeParser(), extractor_factory=lambda _: FakeExtractor(values={'total': 1250.5, 'invoice_number': 'FV/2026/11/042'}, on_call=lambda: time.sleep(5)), start_worker=True), host='127.0.0.1', port=8000)"
 *     # apps/studio
 *     SKIP_ENV_VALIDATION=1 npm run build
 *     FORMLENS_API_URL=http://127.0.0.1:8000 npm run test:e2e -- --project=chromium
 */

const API_URL = (process.env.FORMLENS_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** A name no stored form has, so the test finds its own card. */
const FORM_NAME = `New document e2e ${randomUUID()}`;

/**
 * The form's fields in their order, which is not alphabetical, and the text the Results panel shows for each: what the
 * fake extractor of the header finds, or `null` for the field it finds nothing for.
 */
const FIELDS: Array<{ name: string; type: "date" | "number" | "text"; shown: string | null }> = [
  { name: "total", shown: "1250.5", type: "number" },
  { name: "invoice_number", shown: "FV/2026/11/042", type: "text" },
  { name: "due_date", shown: null, type: "date" }
];

/** The headline of the status card for pending, running and completed, in the order the extraction moves through. */
const HEADLINES = ["Waiting in queue", "Reading document", "The document has been read"];
const COMPLETED_HEADLINE = "The document has been read";
/** The steps of the status stepper; the last one is "Done" for every unfinished status, so only its state tells. */
const STATUS_STEPS = '[aria-label="Extraction status"] [data-slot="stepper-item"]';

/** The Studio checks the extraction every 3 s; a change may also wait for the request in flight. */
const POLL_MS = 3000;
const POLL_SLACK_MS = 1000;
/** Worst case from the landing to completed: a 2 s idle worker, the 5 s extractor, one poll, and slack. */
const COMPLETION_TIMEOUT_MS = 25_000;

/** A minimal PDF: the API checks for `%PDF-` in the first bytes, and the fake parser reads nothing. */
const PDF = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
    ""
  ].join("\n")
);

type HeadlineChange = { at: number; text: string };

/** What the page records in the browser: the marker survives only when the page is never reloaded. */
type RecordingWindow = Window & { __e2eHeadlines?: Array<HeadlineChange>; __e2eMarker?: string };

async function isApiReady(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(`${API_URL}/health/ready`, { timeout: 3000 });
    return response.status() === 200;
  } catch {
    return false;
  }
}

async function createForm(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API_URL}/v1/templates`, {
    data: {
      description: "Created by the new document end-to-end test",
      fields: FIELDS.map(({ name, type }) => ({ name, required: false, type })),
      name: FORM_NAME
    }
  });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  return id;
}

/** When the API first reported each status of the extraction, polled from here until it is final. */
async function watchApiStatus(request: APIRequestContext, extractionId: string): Promise<Map<string, number>> {
  const firstSeen = new Map<string, number>();
  const deadline = Date.now() + COMPLETION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await request.get(`${API_URL}/v1/extractions/${extractionId}`);
    const { status } = (await response.json()) as { status: string };
    if (!firstSeen.has(status)) {
      firstSeen.set(status, Date.now());
    }
    if (status === "completed" || status === "failed" || status === "cancelled") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return firstSeen;
}

it.describe("New document", () => {
  // One browser runs the flow: the browsers would queue extractions in the same API at the same time.
  it.describe.configure({ mode: "serial" });

  // Probed once: an API that goes away in the middle of the flow fails the test, it does not skip it.
  let hasApi = false;
  let templateId: string | null = null;

  it.beforeAll(async ({ browserName, request }) => {
    hasApi = await isApiReady(request);
    if (hasApi && browserName === "chromium") {
      templateId = await createForm(request);
    }
  });

  it.beforeEach(({ browserName }, testInfo) => {
    testInfo.skip(browserName !== "chromium", "the flow runs in one browser");
    testInfo.skip(!hasApi, `no API answers at ${API_URL}; the new document flow is manual then`);
  });

  it.afterAll(async ({ request }) => {
    if (templateId !== null) {
      await request.delete(`${API_URL}/v1/templates/${templateId}`);
    }
  });

  it("reads a document from Use form to the results, live (AC6, AC14, AC21, AC24)", async ({
    page,
    request
  }, testInfo) => {
    it.setTimeout(60_000);
    const formId = templateId ?? "";
    expect(formId).not.toBe("");

    await it.step("Use form opens the Upload step with the form selected (AC6)", async () => {
      await page.goto(`/forms?q=${encodeURIComponent(FORM_NAME)}`);
      const card = page.getByRole("listitem").filter({ hasText: FORM_NAME });
      await card.getByRole("link", { name: "Use form" }).click();

      await expect(page).toHaveURL(new RegExp(`/documents/new\\?template=${formId}$`));
      await expect(page.getByText(FORM_NAME, { exact: true })).toBeVisible();
      await expect(page.getByText(`${FIELDS.length} fields to find`)).toBeVisible();
      const currentStep = page.locator('[aria-label="Steps"]').getByRole("tab", { name: /Upload document/ });
      await expect(currentStep).toHaveAttribute("aria-current", "step");
    });

    let extractionId = "";

    await it.step("Start analysis lands on the status page of the new extraction (AC14)", async () => {
      await page.getByLabel("Document to analyse").setInputFiles({
        buffer: PDF,
        mimeType: "application/pdf",
        name: "invoice.pdf"
      });
      await expect(page.getByText("invoice.pdf", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Start analysis" }).click();

      await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/);
      extractionId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
      await expect(page.getByRole("heading", { level: 1, name: "Document status" })).toBeVisible();
      await expect(page.getByRole("main").getByText(extractionId, { exact: true })).toBeVisible();
      // The extractor holds the job for 5 s, so the last step cannot be completed yet: AC24 checks it is later.
      await expect(page.locator(STATUS_STEPS).last()).not.toHaveAttribute("data-state", "completed");
    });

    await it.step("The status moves to completed without a reload, each change within 3 s (AC21)", async () => {
      const apiStatus = watchApiStatus(request, extractionId);
      const headline = page.getByRole("heading", { level: 2, name: new RegExp(`^(${HEADLINES.join("|")})$`) });
      await expect(headline).toBeVisible();

      const marker = randomUUID();
      await page.evaluate(
        ({ headlines, marker }) => {
          const recording = window as RecordingWindow;
          const changes: Array<HeadlineChange> = [];
          recording.__e2eHeadlines = changes;
          recording.__e2eMarker = marker;

          function record() {
            const current = Array.from(document.querySelectorAll("h2")).find(
              (element) =>
                headlines.includes(element.textContent ?? "") &&
                element.closest('[aria-label="Extraction status"]') === null
            );
            const text = current?.textContent ?? null;
            if (text !== null && changes.at(-1)?.text !== text) {
              changes.push({ at: Date.now(), text });
            }
          }

          record();
          new MutationObserver(() => record()).observe(document.body, {
            characterData: true,
            childList: true,
            subtree: true
          });
        },
        { headlines: HEADLINES, marker }
      );
      let navigations = 0;
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) {
          navigations += 1;
        }
      });

      await expect(page.getByRole("heading", { level: 2, name: COMPLETED_HEADLINE })).toBeVisible({
        timeout: COMPLETION_TIMEOUT_MS
      });

      const recorded = await page.evaluate(() => {
        const recording = window as RecordingWindow;
        return { changes: recording.__e2eHeadlines ?? [], marker: recording.__e2eMarker };
      });
      const sequence = recorded.changes.map(({ text }) => text);
      const firstSeenByApi = await apiStatus;
      testInfo.annotations.push({ description: sequence.join(" → "), type: "observed states" });

      expect(recorded.marker).toBe(marker);
      expect(navigations).toBe(0);
      expect(sequence.at(-1)).toBe(COMPLETED_HEADLINE);
      const positions = sequence.map((text) => HEADLINES.indexOf(text));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      // The extractor holds the job in `running` for 5 s, longer than one poll, so the page must show it.
      expect(sequence).toContain("Reading document");

      // A change seen after the recording started came from a poll: no later than one poll after the API had it.
      const apiStatusByHeadline = new Map([
        ["Reading document", "running"],
        [COMPLETED_HEADLINE, "completed"]
      ]);
      for (const { at, text } of recorded.changes.slice(1)) {
        const status = apiStatusByHeadline.get(text);
        const apiAt = status === undefined ? undefined : firstSeenByApi.get(status);
        expect(apiAt, `the API never reported the state behind "${text}"`).toBeDefined();
        expect(at - (apiAt ?? 0), `"${text}" lagged the API`).toBeLessThanOrEqual(POLL_MS + POLL_SLACK_MS);
      }
    });

    await it.step("The Results panel lists every field in form order, and the stepper shows Done (AC24)", async () => {
      const rows = page.getByRole("list", { name: "Results" }).getByRole("listitem");
      await expect(rows).toHaveCount(FIELDS.length);
      for (const [index, field] of FIELDS.entries()) {
        const row = rows.nth(index);
        await expect(row.locator("span").first()).toHaveText(field.name);
        await expect(row).toContainText(field.shown ?? "Not found");
      }
      await expect(page.getByText("Waiting for the result")).toHaveCount(0);

      // "Done" is the last title for pending and running too; only the completed extraction completes that step.
      const lastStep = page.locator(STATUS_STEPS).last();
      await expect(lastStep).toHaveText(/Done/);
      await expect(lastStep).toHaveAttribute("data-state", "completed");
    });
  });
});
