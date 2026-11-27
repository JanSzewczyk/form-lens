import { type ExtractionResponse, FailureReason } from "@form-lens/api-client";
import { expect, fn, screen, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";
import {
  CancelFailureKind,
  type CancelResult,
  type ExtractionView,
  ExtractionViewStatus
} from "~/features/extractions/schemas/extraction";
import { extractionResponseBuilder } from "~/features/extractions/utils/extraction.builder";

import { ExtractionStatusView } from "./extraction-status-view";

const FAST_INTERVAL_MS = 30;
const FIELDS: ExtractionView["fields"] = [
  { name: "invoice_number", required: true, type: "text" },
  { name: "issue_date", required: true, type: "date" },
  { name: "total_gross", required: false, type: "number" }
];

function viewWith(overrides: Partial<ExtractionResponse>): ExtractionView {
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

const cancelMock = fn<(extractionId: string) => Promise<CancelResult>>();

const meta = preview.meta({
  args: { initial: PENDING, onCancelAction: cancelMock },
  beforeEach: () => {
    const realFetch = globalThis.fetch;
    fetchMock.mockReset();
    cancelMock.mockReset();
    // By default a cancel never answers; a story that cancels says what the action returns.
    cancelMock.mockImplementation(() => new Promise<CancelResult>(() => undefined));
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

Running.test("Shows Cancel job while the extraction is unfinished", async ({ canvas }) => {
  await expect(canvas.getByRole("button", { name: "Cancel job" })).toBeVisible();
});

const COMPLETED = viewWith({
  fields: [
    { name: "invoice_number", required: true, type: "text" },
    { name: "paid", required: false, type: "boolean" },
    { name: "due_date", required: true, type: "date" }
  ],
  missing_required: ["due_date"],
  result: { due_date: null, invoice_number: "FV/1/2026", paid: null },
  status: ExtractionViewStatus.completed
});

export const Completed = meta.story({ args: { initial: COMPLETED } });

Completed.test(
  "Lists the results in form order with Not found and Missing required, and the stepper shows Done (AC24, AC25)",
  async ({ canvas }) => {
    const items = Array.from(canvas.getByRole("list", { name: "Results" }).querySelectorAll("li"));

    await expect(items.map((item) => item.textContent)).toEqual([
      "invoice_numberFV/1/2026",
      "paidNot found",
      "due_dateMissing required"
    ]);
    await expect(canvas.getByText("1 required field was not found.")).toBeVisible();
    await expect(canvas.getAllByRole("tab").at(-1)).toHaveTextContent("Done");
    await expect(canvas.getByText("Completed")).toBeVisible();
  }
);

Completed.test("Shows no Cancel job and sends no checks (AC31)", async ({ canvas }) => {
  await expect(canvas.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
  await expect(fetchMock).not.toHaveBeenCalled();
});

const FAILED = viewWith({
  error: { message: "The document could not be parsed.", reason: FailureReason.parse_failed },
  status: ExtractionViewStatus.failed
});

export const Failed = meta.story({ args: { initial: FAILED } });

Failed.test(
  "Shows the API's message and Try again with the same form, without Cancel job (AC26, AC31)",
  async ({ canvas }) => {
    await expect(canvas.getByText("The document could not be parsed.")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      `/documents/new?template=${FAILED.template_id}`
    );
    await expect(canvas.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
  }
);

export const Cancelled = meta.story({ args: { initial: viewWith({ status: ExtractionViewStatus.cancelled }) } });

Cancelled.test("Shows the extraction as cancelled, without Cancel job (AC31)", async ({ canvas }) => {
  await expect(canvas.getByText("The extraction was cancelled")).toBeVisible();
  await expect(canvas.getAllByRole("tab").at(-1)).toHaveTextContent("Cancelled");
  await expect(canvas.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
});

export const CancelWhilePolling = meta.story({
  args: { intervalMs: FAST_INTERVAL_MS },
  beforeEach: () => {
    answerChecksWith([json(PENDING)]);
    cancelMock.mockImplementation((extractionId) =>
      Promise.resolve({
        extraction: viewWith({ id: extractionId, status: ExtractionViewStatus.cancelled }),
        success: true
      })
    );
  },
  name: "Cancel while polling"
});

CancelWhilePolling.test(
  "Confirming shows the extraction as cancelled and stops the checks (AC30)",
  async ({ canvas, userEvent }) => {
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));

    await userEvent.click(canvas.getByRole("button", { name: "Cancel job" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel the job" }));

    await expect(await canvas.findByText("The extraction was cancelled")).toBeVisible();
    await expect(cancelMock).toHaveBeenCalledOnce();
    await expect(cancelMock).toHaveBeenCalledWith(PENDING.id);
    await expect(canvas.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
    const callsWhenCancelled = fetchMock.mock.calls.length;
    // Absence of checks can only be shown over a window: ten intervals after the cancel.
    await new Promise((resolve) => setTimeout(resolve, FAST_INTERVAL_MS * 10));
    await expect(fetchMock).toHaveBeenCalledTimes(callsWhenCancelled);
  }
);

CancelWhilePolling.test("Dismissing the confirmation changes nothing (AC30)", async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Cancel job" }));
  await userEvent.click(await screen.findByRole("button", { name: "Keep running" }));

  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  await expect(cancelMock).not.toHaveBeenCalled();
  await expect(canvas.getByText("Waiting in queue", { selector: "h2" })).toBeVisible();
  await expect(canvas.getByRole("button", { name: "Cancel job" })).toBeVisible();
  const calls = fetchMock.mock.calls.length;
  await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(calls));
});

export const CancelAfterCompletion = meta.story({
  beforeEach: () => {
    cancelMock.mockImplementation(() =>
      Promise.resolve({
        error: "The extraction ended before it could be cancelled.",
        extraction: COMPLETED,
        kind: CancelFailureKind.finished,
        success: false
      })
    );
  },
  name: "Cancel after completion"
});

CancelAfterCompletion.test(
  "Shows the completed result when the cancel is refused because the extraction already ended (409)",
  async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Cancel job" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel the job" }));

    await expect(await canvas.findByText("The document has been read")).toBeVisible();
    await expect(canvas.getByText("FV/1/2026")).toBeVisible();
    await expect(canvas.getByText("The extraction ended before it could be cancelled.")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
  }
);

export const CancelUnavailable = meta.story({
  beforeEach: () => {
    cancelMock.mockImplementation(() =>
      Promise.resolve({
        error: "The job could not be cancelled: the API is unavailable. Try again in a moment.",
        kind: CancelFailureKind.unavailable,
        success: false
      })
    );
  },
  name: "Cancel unavailable"
});

CancelUnavailable.test("Says the job could not be cancelled and keeps it running", async ({ canvas, userEvent }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Cancel job" }));
  await userEvent.click(await screen.findByRole("button", { name: "Cancel the job" }));

  await expect(
    await canvas.findByText("The job could not be cancelled: the API is unavailable. Try again in a moment.")
  ).toBeVisible();
  await expect(canvas.getByText("Waiting in queue", { selector: "h2" })).toBeVisible();
  // The rest of the page is hidden from assistive technology until the dialog has finished closing.
  await expect(await canvas.findByRole("button", { name: "Cancel job" })).toBeEnabled();
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

/** Sets the tab's visibility on the real `document`, which the polling hook reads and listens to. */
function defineTabHidden(isHidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => isHidden });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (isHidden ? "hidden" : "visible")
  });
}

function setTabHidden(isHidden: boolean) {
  defineTabHidden(isHidden);
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Starts the story with the tab hidden or visible; the cleanup restores the browser's own `document.hidden`. */
function fakeTabVisibility(isHiddenAtStart: boolean) {
  defineTabHidden(isHiddenAtStart);
  return () => {
    Reflect.deleteProperty(document, "hidden");
    Reflect.deleteProperty(document, "visibilityState");
  };
}

export const OpenedInHiddenTab = meta.story({
  // A minute between checks: a check within a few seconds can only be the one made when the tab shows.
  args: { intervalMs: 60_000 },
  beforeEach: () => {
    answerChecksWith([json(viewWith({ status: ExtractionViewStatus.running }))]);
    return fakeTabVisibility(true);
  },
  name: "Opened in a hidden tab"
});

OpenedInHiddenTab.test(
  "Checks once at once when the hidden tab becomes visible and shows the answer (AC23)",
  async ({ canvas }) => {
    await expect(fetchMock).not.toHaveBeenCalled();

    setTabHidden(false);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await expect(await canvas.findByText("Reading document", { selector: "h2" })).toBeVisible();
  }
);

export const HiddenWhilePolling = meta.story({
  args: { intervalMs: FAST_INTERVAL_MS },
  beforeEach: () => {
    answerChecksWith([json(viewWith({ status: ExtractionViewStatus.pending }))]);
    return fakeTabVisibility(false);
  },
  name: "Hidden while polling"
});

HiddenWhilePolling.test(
  "Sends no checks while the tab is hidden and resumes them when it is visible again (AC23)",
  async () => {
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));

    setTabHidden(true);
    const callsWhenHidden = fetchMock.mock.calls.length;
    // Absence of checks can only be shown over a window: ten intervals with the tab hidden.
    await new Promise((resolve) => setTimeout(resolve, FAST_INTERVAL_MS * 10));
    await expect(fetchMock).toHaveBeenCalledTimes(callsWhenHidden);

    setTabHidden(false);
    // The check on becoming visible is sent at once, before any timer.
    await expect(fetchMock).toHaveBeenCalledTimes(callsWhenHidden + 1);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(callsWhenHidden + 3));
  }
);

export const ReopenedWhileRunning = meta.story({
  // No intervalMs: the page renders the view with the production interval.
  args: { initial: viewWith({ status: ExtractionViewStatus.running }) },
  beforeEach: () => {
    answerChecksWith([
      json(viewWith({ status: ExtractionViewStatus.running })),
      json(viewWith({ status: ExtractionViewStatus.completed }))
    ]);
  },
  name: "Reopened while running"
});

ReopenedWhileRunning.test(
  "Resumes checks every 3 s from the server-rendered status and shows the change (AC27, AC21)",
  async ({ canvas }) => {
    const start = performance.now();
    await expect(canvas.getByText("Reading document", { selector: "h2" })).toBeVisible();

    await expect(await canvas.findByText("The document has been read", undefined, { timeout: 8000 })).toBeVisible();
    const elapsed = performance.now() - start;

    await expect(fetchMock).toHaveBeenCalledTimes(2);
    // Two checks 3 s apart, the first 3 s after the view mounted (slightly before this test started).
    await expect(elapsed).toBeGreaterThanOrEqual(5500);
    await expect(elapsed).toBeLessThan(7500);
  }
);
