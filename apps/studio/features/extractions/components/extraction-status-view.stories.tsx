import { expect, fn, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";
import { type ExtractionView, ExtractionViewStatus } from "~/features/extractions/schemas/extraction";
import { extractionResponseBuilder } from "~/features/extractions/utils/extraction.builder";

import { ExtractionStatusView } from "./extraction-status-view";

const FAST_INTERVAL_MS = 30;
const FIELDS: ExtractionView["fields"] = [
  { name: "invoice_number", required: true, type: "text" },
  { name: "issue_date", required: true, type: "date" },
  { name: "total_gross", required: false, type: "number" }
];

function viewWith(overrides: Partial<ExtractionView>): ExtractionView {
  return extractionResponseBuilder.one({
    overrides: {
      fields: FIELDS,
      filename: "invoice_118_2026.pdf",
      id: "10000000-0000-4000-8000-000000000118",
      template_name: "VAT invoice",
      ...overrides
    }
  });
}

const PENDING = viewWith({ status: ExtractionViewStatus.pending });

const fetchMock = fn<typeof fetch>();

/** Answers every check of the Studio route in turn with `answers`; the last one repeats. */
function answerChecksWith(answers: Array<() => Promise<Response>>) {
  let call = 0;
  fetchMock.mockImplementation(() => {
    const answer = answers[Math.min(call, answers.length - 1)];
    call += 1;
    return answer ? answer() : new Promise<Response>(() => undefined);
  });
}

function json(view: ExtractionView) {
  return () => Promise.resolve(Response.json(view));
}

const meta = preview.meta({
  args: { initial: PENDING },
  beforeEach: () => {
    const realFetch = globalThis.fetch;
    fetchMock.mockReset();
    // By default a check never answers, so a story shows exactly the state it was given.
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    globalThis.fetch = fetchMock;

    return () => {
      globalThis.fetch = realFetch;
    };
  },
  component: ExtractionStatusView,
  parameters: { layout: "padded" },
  title: "Features/Extractions/Extraction Status View"
});

export const Pending = meta.story({});

Pending.test(
  "Shows Uploaded done, Waiting in queue current, a Waiting badge and a placeholder per field (AC19)",
  async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("tab", { current: "step" })).toHaveTextContent("Waiting in queue");
    await expect(canvasElement.querySelector('[data-state="completed"]')).toHaveTextContent("Uploaded");
    await expect(canvas.getByText("Waiting", { exact: true })).toBeVisible();
    const results = canvas.getByRole("list", { name: "Results" });
    await expect(results.querySelectorAll("li")).toHaveLength(FIELDS.length);
    for (const field of FIELDS) {
      await expect(canvas.getByText(field.name)).toBeVisible();
    }
  }
);

Pending.test("Shows file · form, the submit time and the polling footer with the id (AC39)", async ({ canvas }) => {
  await expect(canvas.getByText("invoice_118_2026.pdf · VAT invoice")).toBeVisible();
  await expect(canvas.getByText(/26 Nov 2026/)).toBeVisible();
  await expect(canvas.getByText("Polling job status every 3 seconds")).toBeVisible();
  await expect(canvas.getByText(PENDING.id)).toBeVisible();
});

export const Running = meta.story({ args: { initial: viewWith({ status: ExtractionViewStatus.running }) } });

Running.test("Shows Reading document as the current step (AC20)", async ({ canvas }) => {
  await expect(canvas.getByRole("tab", { current: "step" })).toHaveTextContent("Reading document");
  await expect(canvas.getByText("In progress")).toBeVisible();
});

export const LiveUpdates = meta.story({
  args: { intervalMs: FAST_INTERVAL_MS },
  beforeEach: () => {
    answerChecksWith([
      json(viewWith({ status: ExtractionViewStatus.running })),
      json(viewWith({ status: ExtractionViewStatus.completed }))
    ]);
  }
});

LiveUpdates.test(
  "Follows pending → running → completed without a reload, then stops checking (AC21, AC22)",
  async ({ canvas }) => {
    await expect(await canvas.findByText("The document has been read")).toBeVisible();
    await expect(fetchMock).toHaveBeenCalledWith(
      `/api/extractions/${PENDING.id}`,
      expect.objectContaining({ cache: "no-store" })
    );
    const calls = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, FAST_INTERVAL_MS * 5));
    await expect(fetchMock).toHaveBeenCalledTimes(calls);
    await expect(calls).toBe(2);
  }
);

export const Unreachable = meta.story({
  args: { intervalMs: FAST_INTERVAL_MS },
  beforeEach: () => {
    answerChecksWith([
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.resolve(Response.json({ unreachable: true }, { status: 502 })),
      json(viewWith({ status: ExtractionViewStatus.running }))
    ]);
  }
});

Unreachable.test(
  "Says the status cannot be refreshed, keeps checking and clears the notice once the API answers (AC29)",
  async ({ canvas }) => {
    await expect(await canvas.findByText("The status cannot be refreshed")).toBeVisible();
    await expect(await canvas.findByText("Reading document", { selector: "h2" })).toBeVisible();
    await expect(canvas.queryByText("The status cannot be refreshed")).not.toBeInTheDocument();
    await expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  }
);

export const GoneWhilePolling = meta.story({
  args: { intervalMs: FAST_INTERVAL_MS },
  beforeEach: () => {
    answerChecksWith([() => Promise.resolve(Response.json({ notFound: true }, { status: 404 }))]);
  }
});

GoneWhilePolling.test(
  "Says the extraction was not found or expired and links to New document (AC28)",
  async ({ canvas }) => {
    await expect(await canvas.findByText("Extraction not found")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "New document" })).toHaveAttribute("href", "/documents/new");
    await expect(fetchMock).toHaveBeenCalledOnce();
  }
);

export const NoFileName = meta.story({
  args: { initial: viewWith({ filename: null, status: ExtractionViewStatus.pending }) }
});

NoFileName.test("Shows only the form when the extraction kept no file name", async ({ canvas }) => {
  await expect(canvas.getByText("VAT invoice", { exact: true })).toBeVisible();
  await expect(canvas.queryByText(/·/)).not.toBeInTheDocument();
});

const HTML_FILE_NAME = `<img src=x onerror="alert(1)">"quoted" & 'single'.pdf`;

export const FileNameWithHtml = meta.story({ args: { initial: viewWith({ filename: HTML_FILE_NAME }) } });

FileNameWithHtml.test("Shows a file name with HTML and quotes as plain text", async ({ canvas, canvasElement }) => {
  await expect(canvas.getByText(`${HTML_FILE_NAME} · VAT invoice`)).toBeVisible();
  await expect(canvasElement.querySelector("img")).toBeNull();
});

export const PhoneWidth = meta.story({
  args: {
    initial: viewWith({
      filename: "a_scanned_supplier_invoice_with_a_very_long_name_from_the_accounting_export_2026_11.pdf"
    })
  },
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  name: "Phone width"
});

PhoneWidth.test("Stacks the cards and the steps without horizontal scroll on a phone (AC35)", async ({ canvas }) => {
  await expect(window.matchMedia("(min-width: 640px)").matches).toBe(false);

  await waitFor(() =>
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth)
  );
  // The id sits in the footer, at the bottom of the status card: stacked, the Results list starts below it.
  const statusCardBottom = canvas.getByText(PENDING.id).getBoundingClientRect().bottom;
  const resultsTop = canvas.getByRole("list", { name: "Results" }).getBoundingClientRect().top;
  await expect(resultsTop).toBeGreaterThan(statusCardBottom);
  const stepTops = canvas.getAllByRole("tab").map((step) => step.getBoundingClientRect().top);
  await expect(stepTops[0]).toBeLessThan(stepTops[1] ?? 0);
});
