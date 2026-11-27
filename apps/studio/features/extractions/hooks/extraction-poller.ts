import {
  type ExtractionView,
  type ExtractionViewStatus,
  extractionViewSchema,
  FINAL_STATUSES
} from "~/features/extractions/schemas/extraction";

/** What a check found out; `unreachable` stays until the next check that reaches the API. */
export type ExtractionPollUpdate =
  | { kind: "found"; extraction: ExtractionView }
  | { kind: "not-found" }
  | { kind: "unreachable" };

/** The part of `document` the poller needs, so a test can hand it a plain `EventTarget`. */
type VisibilitySource = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

type ExtractionPollerOptions = {
  url: string;
  initialStatus: ExtractionViewStatus;
  intervalMs: number;
  /** Only tests pass one; the browser's `fetch` otherwise. */
  fetchImpl?: typeof fetch;
  visibility: VisibilitySource;
  onUpdate(update: ExtractionPollUpdate): void;
};

const REQUEST_TIMEOUT_MS = 10_000;

async function check(url: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<ExtractionPollUpdate> {
  const response = await fetchImpl(url, { cache: "no-store", signal });
  if (response.status === 404) {
    return { kind: "not-found" };
  }
  if (!response.ok) {
    return { kind: "unreachable" };
  }
  const parsed = extractionViewSchema.safeParse(await response.json());
  return parsed.success ? { extraction: parsed.data, kind: "found" } : { kind: "unreachable" };
}

/**
 * Asks the Studio route for the extraction every `intervalMs`, one request at a time: the next check is scheduled only
 * after the previous one answered. It never starts for a final status, stops at the first final status or 404, sends
 * nothing while the tab is hidden and checks once at once when the tab is visible again. A failed request counts as
 * "unreachable" and the checks go on. Returns `stop`, which also aborts the request in flight.
 */
export function startExtractionPoller({
  url,
  initialStatus,
  intervalMs,
  fetchImpl = fetch,
  visibility,
  onUpdate
}: ExtractionPollerOptions): () => void {
  if (FINAL_STATUSES.includes(initialStatus)) {
    return () => undefined;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | undefined;
  let isStopped = false;

  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    clearTimer();
    if (!isStopped && !visibility.hidden) {
      timer = setTimeout(() => void run(), intervalMs);
    }
  }

  async function run() {
    clearTimer();
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    let update: ExtractionPollUpdate;
    try {
      update = await check(
        url,
        fetchImpl,
        AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      );
    } catch {
      update = { kind: "unreachable" };
    }
    /** A check that was aborted (the tab came back, or the page left) is not the newest; its answer is dropped. */
    if (inFlight !== controller || isStopped) {
      return;
    }
    inFlight = undefined;
    onUpdate(update);
    const isFinal =
      update.kind === "not-found" || (update.kind === "found" && FINAL_STATUSES.includes(update.extraction.status));
    if (isFinal) {
      stop();
      return;
    }
    schedule();
  }

  function handleVisibilityChange() {
    if (visibility.hidden) {
      clearTimer();
      return;
    }
    void run();
  }

  function stop() {
    isStopped = true;
    clearTimer();
    inFlight?.abort();
    inFlight = undefined;
    visibility.removeEventListener("visibilitychange", handleVisibilityChange);
  }

  visibility.addEventListener("visibilitychange", handleVisibilityChange);
  schedule();
  return stop;
}
