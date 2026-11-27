import { afterEach, beforeEach, describe, expect, test as it, vi } from "vitest";

import { type ExtractionView, ExtractionViewStatus } from "~/features/extractions/schemas/extraction";

import { type ExtractionPollUpdate, startExtractionPoller } from "./extraction-poller";

/**
 * The fetch of the Studio route is injected rather than served by MSW: the tests count requests exactly under fake
 * timers, and MSW's interceptor does not settle deterministically when `setTimeout` is faked.
 */
const URL = "/api/extractions/10000000-0000-4000-8000-000000000001";
const INTERVAL_MS = 3000;

function viewWith(status: ExtractionViewStatus): ExtractionView {
  return {
    created_at: "2026-11-26T08:00:00Z",
    fields: [{ name: "invoice_number", required: true, type: "text" }],
    filename: "invoice_118_2026.pdf",
    id: "10000000-0000-4000-8000-000000000001",
    status,
    template_id: "00000000-0000-4000-8000-000000000001",
    template_name: "VAT invoice"
  };
}

class FakeDocument extends EventTarget {
  hidden = false;

  setHidden(isHidden: boolean) {
    this.hidden = isHidden;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

type Answer = () => Promise<Response>;

/** Starts a poller whose route answers in turn with `answers` (the last one repeats). */
function setup({
  initialStatus = ExtractionViewStatus.pending,
  answers = [() => Promise.resolve(Response.json(viewWith(ExtractionViewStatus.pending)))]
}: {
  initialStatus?: ExtractionViewStatus;
  answers?: Array<Answer>;
} = {}) {
  const visibility = new FakeDocument();
  const updates: Array<ExtractionPollUpdate> = [];
  let call = 0;
  const fetchImpl = vi.fn<typeof fetch>(() => {
    const answer = answers[Math.min(call, answers.length - 1)] as Answer;
    call += 1;
    return answer();
  });
  const stop = startExtractionPoller({
    fetchImpl,
    initialStatus,
    intervalMs: INTERVAL_MS,
    onUpdate: (update) => updates.push(update),
    url: URL,
    visibility: visibility as unknown as Document
  });
  return { fetchImpl, stop, updates, visibility };
}

function json(status: ExtractionViewStatus): Answer {
  return () => Promise.resolve(Response.json(viewWith(status)));
}

function statusCode(code: number): Answer {
  return () => Promise.resolve(Response.json({}, { status: code }));
}

describe("startExtractionPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks the Studio route every 3 s with no-store, not on start", async () => {
    const { fetchImpl, stop } = setup();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
    expect(fetchImpl).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(URL, expect.objectContaining({ cache: "no-store" }));

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    stop();
  });

  it("reports pending, running and completed in turn within 3 s each, then stops (AC21, AC22)", async () => {
    const { fetchImpl, updates } = setup({
      answers: [json(ExtractionViewStatus.running), json(ExtractionViewStatus.completed)]
    });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(updates.at(-1)).toEqual({ extraction: viewWith(ExtractionViewStatus.running), kind: "found" });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(updates.at(-1)).toEqual({ extraction: viewWith(ExtractionViewStatus.completed), kind: "found" });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([ExtractionViewStatus.completed, ExtractionViewStatus.failed, ExtractionViewStatus.cancelled])(
    "never checks an extraction that is already %s, not even when the tab comes back (AC22)",
    async (status) => {
      const { fetchImpl, visibility } = setup({ initialStatus: status });

      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10);
      visibility.setHidden(true);
      visibility.setHidden(false);
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10);

      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it("stops at failed and cancelled answers too (AC22)", async () => {
    const { fetchImpl, visibility } = setup({ answers: [json(ExtractionViewStatus.failed)] });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    visibility.setHidden(true);
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10);

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("sends nothing while the tab is hidden, however long (AC23)", async () => {
    const { fetchImpl, visibility, stop } = setup();

    visibility.setHidden(true);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(fetchImpl).not.toHaveBeenCalled();
    stop();
  });

  it("checks once at once when the tab is visible again, then every 3 s (AC23)", async () => {
    const { fetchImpl, visibility, stop } = setup();
    visibility.setHidden(true);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);

    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
    expect(fetchImpl).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    stop();
  });

  it("schedules nothing when a check answers after the tab was hidden", async () => {
    let answer: (response: Response) => void = () => undefined;
    const { fetchImpl, visibility, stop } = setup({
      answers: [() => new Promise<Response>((resolve) => (answer = resolve))]
    });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(fetchImpl).toHaveBeenCalledOnce();

    visibility.setHidden(true);
    answer(Response.json(viewWith(ExtractionViewStatus.running)));
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10);

    expect(fetchImpl).toHaveBeenCalledOnce();
    stop();
  });

  it("aborts a check in flight when the tab comes back, so only one chain runs", async () => {
    const { fetchImpl, visibility, updates, stop } = setup({
      answers: [() => new Promise<Response>(() => undefined), json(ExtractionViewStatus.running)]
    });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    const firstSignal = fetchImpl.mock.calls[0]?.[1]?.signal;

    visibility.setHidden(true);
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);

    expect(firstSignal?.aborted).toBe(true);
    expect(updates).toEqual([{ extraction: viewWith(ExtractionViewStatus.running), kind: "found" }]);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    stop();
  });

  it("reports unreachable on a 502 and on a failed request, keeps checking, and clears it on the next answer (AC29)", async () => {
    const { fetchImpl, updates, stop } = setup({
      answers: [
        statusCode(502),
        () => Promise.reject(new TypeError("Failed to fetch")),
        json(ExtractionViewStatus.running)
      ]
    });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(updates.at(-1)).toEqual({ kind: "unreachable" });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(updates.at(-1)).toEqual({ kind: "unreachable" });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(updates.at(-1)).toEqual({ extraction: viewWith(ExtractionViewStatus.running), kind: "found" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    stop();
  });

  it("treats an answer that is not an extraction as unreachable", async () => {
    const { updates, stop } = setup({ answers: [() => Promise.resolve(Response.json({ status: "weird" }))] });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(updates).toEqual([{ kind: "unreachable" }]);
    stop();
  });

  it("stops and reports not found when the extraction disappears, e.g. its result expired (AC28)", async () => {
    const { fetchImpl, updates } = setup({ answers: [statusCode(404)] });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);

    expect(updates).toEqual([{ kind: "not-found" }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("stop() aborts the request in flight, drops its answer and ignores later tab changes", async () => {
    let answer: (response: Response) => void = () => undefined;
    const { fetchImpl, visibility, updates, stop } = setup({
      answers: [() => new Promise<Response>((resolve) => (answer = resolve))]
    });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    const signal = fetchImpl.mock.calls[0]?.[1]?.signal;

    stop();
    answer(Response.json(viewWith(ExtractionViewStatus.running)));
    visibility.setHidden(true);
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);

    expect(signal?.aborted).toBe(true);
    expect(updates).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
