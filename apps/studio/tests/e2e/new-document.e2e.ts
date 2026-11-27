import { randomUUID } from "node:crypto";

import { type APIRequestContext, expect, test as it } from "@playwright/test";

/**
 * Happy path of the new document flow: Use form on a Forms card → Upload → Start analysis → the status page follows
 * the extraction from pending to completed without a reload and lists the results in the order of the form.
 *
 * The test skips itself only when no API answers `/health/ready`. That check covers the model, not the worker, so
 * against the schemathesis app that forms.e2e.ts documents (its worker is off and extractions stay `pending`) the test
 * runs and times out. Start the same app with the worker on, as below: the fake extractor sleeps 5 s while a job is
 * `running`, longer than the Studio's 3 s poll, so the page shows each state, and its `values` must match `FIELDS`.
 * The CI workflow runs no E2E, so run it by hand:
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

/** The field types this test's form uses, as the API names them. */
const FieldType = {
  date: "date",
  number: "number",
  text: "text"
} as const;

type FieldType = (typeof FieldType)[keyof typeof FieldType];

/** The statuses of an extraction, as the API names them. */
const ApiStatus = {
  cancelled: "cancelled",
  completed: "completed",
  failed: "failed",
  pending: "pending",
  running: "running"
} as const;

type ApiStatus = (typeof ApiStatus)[keyof typeof ApiStatus];

const FINAL_API_STATUSES: ReadonlyArray<ApiStatus> = [ApiStatus.cancelled, ApiStatus.completed, ApiStatus.failed];

/**
 * The form's fields in their order, which is not alphabetical, and the text the Results panel shows for each: what the
 * fake extractor of the header finds, or `null` for the field it finds nothing for.
 */
const FIELDS: Array<{ name: string; type: FieldType; shown: string | null }> = [
  { name: "total", shown: "1250.5", type: FieldType.number },
  { name: "invoice_number", shown: "FV/2026/11/042", type: FieldType.text },
  { name: "due_date", shown: null, type: FieldType.date }
];

const PENDING_HEADLINE = "Waiting in queue";
const RUNNING_HEADLINE = "Reading document";
const COMPLETED_HEADLINE = "The document has been read";
/** The headline of the status card for pending, running and completed, in the order the extraction moves through. */
const HEADLINES = [PENDING_HEADLINE, RUNNING_HEADLINE, COMPLETED_HEADLINE];

/** The Studio checks the extraction every 3 s; a change may also wait for the request in flight. */
const POLL_MS = 3000;
const POLL_SLACK_MS = 1000;
/**
 * Worst case from the landing to completed: the blocker ahead in the queue (a 2 s idle worker and the 5 s extractor),
 * this job's 5 s, one poll, and slack.
 */
const COMPLETION_TIMEOUT_MS = 35_000;

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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

/**
 * Queues an extraction for the form ahead of the one the test submits. The single worker reads one job at a time and
 * the fake extractor holds each for 5 s, so the test's job is certain to wait in the queue first.
 */
async function queueBlocker(request: APIRequestContext, formId: string) {
  const response = await request.post(`${API_URL}/v1/extractions`, {
    multipart: {
      file: { buffer: PDF, mimeType: "application/pdf", name: "blocker.pdf" },
      template_id: formId
    }
  });
  expect(response.status(), "the API refused the blocker extraction").toBe(202);
}

/** When the API first reported each status of the extraction, polled from here until it is final. */
async function watchApiStatus(request: APIRequestContext, extractionId: string): Promise<Map<ApiStatus, number>> {
  const firstSeen = new Map<ApiStatus, number>();
  const deadline = Date.now() + COMPLETION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await request.get(`${API_URL}/v1/extractions/${extractionId}`);
    if (!response.ok()) {
      throw new Error(`GET /v1/extractions/${extractionId} answered ${response.status()}`);
    }
    const { status } = (await response.json()) as { status: ApiStatus };
    if (!firstSeen.has(status)) {
      firstSeen.set(status, Date.now());
    }
    if (FINAL_API_STATUSES.includes(status)) {
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
    it.setTimeout(90_000);
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
      await queueBlocker(request, formId);
      await page.getByRole("button", { name: "Start analysis" }).click();

      await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/);
      extractionId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
      await expect(page.getByRole("heading", { level: 1, name: "Document status" })).toBeVisible();
      await expect(page.getByRole("main").getByText(extractionId, { exact: true })).toBeVisible();
      // The blocker holds the worker, so the new extraction lands in the queue.
      await expect(page.getByRole("heading", { level: 2, name: PENDING_HEADLINE })).toBeVisible();
    });

    await it.step("The status moves to completed without a reload, each change within one 3 s poll plus the request in flight (AC21)", async () => {
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

      // Both settle before either outcome is used, so the API watcher never outlives a failed wait.
      const [watched, completion] = await Promise.allSettled([
        watchApiStatus(request, extractionId),
        expect(
          page.getByRole("heading", { level: 2, name: COMPLETED_HEADLINE }),
          "the extraction never completed: is the API the header's worker-on app?"
        ).toBeVisible({ timeout: COMPLETION_TIMEOUT_MS })
      ]);
      if (completion.status === "rejected") {
        throw completion.reason;
      }
      if (watched.status === "rejected") {
        throw watched.reason;
      }
      const firstSeenByApi = watched.value;

      const recorded = await page.evaluate(() => {
        const recording = window as RecordingWindow;
        return { changes: recording.__e2eHeadlines ?? [], marker: recording.__e2eMarker };
      });
      const sequence = recorded.changes.map(({ text }) => text);
      testInfo.annotations.push({ description: sequence.join(" → "), type: "observed states" });

      expect(recorded.marker).toBe(marker);
      expect(navigations).toBe(0);
      // Pending lasts while the blocker runs and running lasts 5 s, each longer than one poll: all three show.
      expect(sequence).toEqual(HEADLINES);

      // A change seen after the recording started came from a poll: no later than one poll after the API had it.
      const apiStatusByHeadline = new Map<string, ApiStatus>([
        [RUNNING_HEADLINE, ApiStatus.running],
        [COMPLETED_HEADLINE, ApiStatus.completed]
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
      await expect(rows).toHaveText(
        FIELDS.map(({ name, shown }) => new RegExp(`^${escapeRegExp(name)}${escapeRegExp(shown ?? "Not found")}$`))
      );
      await expect(page.getByText("Waiting for the result")).toHaveCount(0);

      // "Done" is the last title for pending and running too; only the completed extraction completes that step.
      const lastStep = page.getByLabel("Extraction status", { exact: true }).getByRole("tab", { name: /Done$/ });
      await expect(lastStep).toHaveAttribute("data-state", "completed");
    });
  });
});
