import { SidebarProvider } from "@szum-tech/design-system";
import * as React from "react";
import { expect, fn, spyOn, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";
import type { ApiHealth } from "~/lib/api-health-types";

import { ApiStatusLive } from "./api-status-live";

const STATUS_ENDPOINT = "/api/formlens-status";
const CONNECTED: ApiHealth = { host: "localhost:8000", status: "connected" };
const UNAVAILABLE: ApiHealth = { host: "localhost:8000", status: "unavailable" };
const FAST_INTERVAL_MS = 30;
const DEFAULT_INTERVAL_MS = 60_000;
const SETTLE_MS = 300;

const fetchMock = fn<typeof fetch>();
/** Requests the component sent that the test has not answered yet. */
const pendingAnswers: Array<(response: Response) => void> = [];

/**
 * Answers the newest pending check, the only one whose answer counts, and forgets the older ones: they were
 * superseded, so a later wait for "a pending request" means a new one.
 */
function answerLatest(response: Response) {
  pendingAnswers.at(-1)?.(response);
  pendingAnswers.length = 0;
}

function answerNext(body: unknown) {
  answerLatest(Response.json(body));
}

function stubTabHidden(isHidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: isHidden });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: isHidden ? "hidden" : "visible" });
}

function setTabHidden(isHidden: boolean) {
  stubTabHidden(isHidden);
  document.dispatchEvent(new Event("visibilitychange"));
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

/** Timers of the default interval that were started and not yet cleared; the test cannot wait 60 s, so it counts them. */
const defaultIntervalStarts: Array<number> = [];
const liveDefaultIntervals = new Set<number>();

function spyOnDefaultInterval() {
  const realSetInterval = window.setInterval;
  const realClearInterval = window.clearInterval;
  defaultIntervalStarts.length = 0;
  liveDefaultIntervals.clear();

  window.setInterval = ((handler: TimerHandler, delay?: number, ...args: Array<unknown>) => {
    const id = realSetInterval(handler, delay, ...args);
    if (delay === DEFAULT_INTERVAL_MS) {
      defaultIntervalStarts.push(delay);
      liveDefaultIntervals.add(id);
    }
    return id;
  }) as typeof window.setInterval;
  window.clearInterval = ((id?: number) => {
    if (id !== undefined) {
      liveDefaultIntervals.delete(id);
    }
    realClearInterval(id);
  }) as typeof window.clearInterval;

  return () => {
    window.setInterval = realSetInterval;
    window.clearInterval = realClearInterval;
  };
}

function answerEveryCheckWith(makeResponse: () => Promise<Response>) {
  fetchMock.mockImplementation(makeResponse);
}

function RemovableStatus(props: React.ComponentProps<typeof ApiStatusLive>) {
  const [isShown, setIsShown] = React.useState(true);

  return (
    <>
      {isShown ? <ApiStatusLive {...props} /> : null}
      <button onClick={() => setIsShown(false)} type="button">
        Remove status
      </button>
    </>
  );
}

const meta = preview.meta({
  args: {
    initial: CONNECTED
  },
  beforeEach: () => {
    const realFetch = globalThis.fetch;
    pendingAnswers.length = 0;
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => pendingAnswers.push(resolve)));
    globalThis.fetch = fetchMock;

    return () => {
      globalThis.fetch = realFetch;
      Reflect.deleteProperty(document, "hidden");
      Reflect.deleteProperty(document, "visibilityState");
    };
  },
  component: ApiStatusLive,
  decorators: [
    (Story) => (
      <SidebarProvider>
        <div className="bg-sidebar w-60 p-4">
          <Story />
        </div>
      </SidebarProvider>
    )
  ],
  title: "Components/Layout/Api Status Live"
});

export const Connected = meta.story();

Connected.test("Shows the connected status and the API host", async ({ canvas }) => {
  await expect(canvas.getByRole("status")).toHaveTextContent("API connected");
  await expect(canvas.getByText("localhost:8000")).toBeVisible();
});

export const Unavailable = meta.story({
  args: { initial: UNAVAILABLE }
});

Unavailable.test("Shows the unavailable status with the API host", async ({ canvas }) => {
  await expect(canvas.getByRole("status")).toHaveTextContent("API unavailable");
  await expect(canvas.getByText("localhost:8000")).toBeVisible();
});

export const PollingFlipsTheStatus = meta.story({
  args: { intervalMs: FAST_INTERVAL_MS }
});

PollingFlipsTheStatus.test("Flips to unavailable after one interval, without a reload", async ({ canvas }) => {
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(STATUS_ENDPOINT, expect.objectContaining({ cache: "no-store" }))
  );
  await expect(canvas.getByText("API connected")).toBeVisible();

  answerNext({ host: "localhost:8000", status: "unavailable" });

  await expect(await canvas.findByText("API unavailable")).toBeVisible();
});

PollingFlipsTheStatus.test("Recovers to connected when a later check succeeds", async ({ canvas }) => {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  answerNext({ host: "localhost:8000", status: "unavailable" });
  await canvas.findByText("API unavailable");

  await waitFor(() => expect(pendingAnswers.length).toBeGreaterThan(0));
  answerNext({ host: "localhost:8000", status: "connected" });

  await expect(await canvas.findByText("API connected")).toBeVisible();
});

PollingFlipsTheStatus.test("Reports unavailable when the Studio route answers with an error", async ({ canvas }) => {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  answerLatest(new Response("boom", { status: 500 }));

  await expect(await canvas.findByText("API unavailable")).toBeVisible();
  await expect(canvas.getByText("localhost:8000")).toBeVisible();
});

export const TabHidden = meta.story({
  args: { intervalMs: FAST_INTERVAL_MS },
  beforeEach: () => {
    stubTabHidden(true);
  }
});

TabHidden.test("Sends no request while the tab is hidden", async ({ canvas }) => {
  await settle();

  await expect(fetchMock).not.toHaveBeenCalled();
  await expect(canvas.getByText("API connected")).toBeVisible();
});

TabHidden.test("Resumes polling once the tab is visible again", async () => {
  await settle();
  await expect(fetchMock).not.toHaveBeenCalled();

  setTabHidden(false);

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
});

export const TabBecomesHidden = meta.story({
  args: { intervalMs: FAST_INTERVAL_MS }
});

TabBecomesHidden.test("Stops polling when the tab is hidden", async () => {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());

  setTabHidden(true);
  fetchMock.mockClear();
  await settle();

  await expect(fetchMock).not.toHaveBeenCalled();
});

export const TabHiddenLongInterval = meta.story({
  beforeEach: () => {
    stubTabHidden(true);
  }
});

TabHiddenLongInterval.test("Checks once, right away, when the tab becomes visible", async ({ canvas }) => {
  await expect(fetchMock).not.toHaveBeenCalled();

  setTabHidden(false);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  answerNext({ host: "localhost:8000", status: "unavailable" });
  await expect(await canvas.findByText("API unavailable")).toBeVisible();
  await expect(fetchMock).toHaveBeenCalledTimes(1);
});

PollingFlipsTheStatus.test(
  "Treats a failed request to the Studio route as unavailable and keeps the host",
  async ({ canvas }) => {
    answerEveryCheckWith(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(await canvas.findByText("API unavailable")).toBeVisible();
    await expect(canvas.getByText("localhost:8000")).toBeVisible();
  }
);

PollingFlipsTheStatus.test("Treats an answer that is not the status shape as unavailable", async ({ canvas }) => {
  answerEveryCheckWith(() => Promise.resolve(Response.json({ status: "weird" })));

  await expect(await canvas.findByText("API unavailable")).toBeVisible();
  await expect(canvas.getByText("localhost:8000")).toBeVisible();
});

PollingFlipsTheStatus.test("Does not trust a connected answer that names no host", async ({ canvas }) => {
  answerEveryCheckWith(() => Promise.resolve(Response.json({ status: "connected" })));

  await expect(await canvas.findByText("API unavailable")).toBeVisible();
});

PollingFlipsTheStatus.test("Treats a 200 answer that is not JSON as unavailable", async ({ canvas }) => {
  answerEveryCheckWith(() => Promise.resolve(new Response("<html>gateway</html>", { status: 200 })));

  await expect(await canvas.findByText("API unavailable")).toBeVisible();
});

PollingFlipsTheStatus.test("Shows the host of the latest answer", async ({ canvas }) => {
  answerEveryCheckWith(() => Promise.resolve(Response.json({ host: "api.other:9000", status: "connected" })));

  await expect(await canvas.findByText("api.other:9000")).toBeVisible();
  await expect(canvas.getByText("API connected")).toBeVisible();
});

PollingFlipsTheStatus.test("Only ever fetches the Studio route, never the API itself", async () => {
  await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));

  const urls = fetchMock.mock.calls.map(([input]) => String(input));
  for (const url of urls) {
    await expect(url).toBe(STATUS_ENDPOINT);
  }
});

export const LongHost = meta.story({
  args: { initial: { host: "a-very-long-hostname.internal.example.com:8000", status: "connected" } }
});

LongHost.test("Keeps a long host inside the navigation, with the full host in its title", async ({ canvas }) => {
  const host = canvas.getByText("a-very-long-hostname.internal.example.com:8000");
  const sidebarWidth = host.closest("div.bg-sidebar");

  await expect(host).toHaveAttribute("title", "a-very-long-hostname.internal.example.com:8000");
  await expect(sidebarWidth).not.toBeNull();
  await expect(sidebarWidth?.scrollWidth).toBeLessThanOrEqual(sidebarWidth?.clientWidth ?? 0);
});

export const DefaultInterval = meta.story({
  beforeEach: spyOnDefaultInterval
});

DefaultInterval.test("Checks every 60 s when no interval is given, and not on mount", async () => {
  await expect(defaultIntervalStarts).toEqual([DEFAULT_INTERVAL_MS]);
  await settle();
  await expect(fetchMock).not.toHaveBeenCalled();
});

export const DefaultIntervalTabHidden = meta.story({
  beforeEach: () => {
    stubTabHidden(true);
    return spyOnDefaultInterval();
  }
});

DefaultIntervalTabHidden.test("Starts no timer while the tab is hidden", async () => {
  await expect(liveDefaultIntervals.size).toBe(0);
});

DefaultIntervalTabHidden.test(
  "Checks once per time the tab becomes visible, and never holds more than one timer",
  async () => {
    setTabHidden(false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await expect(liveDefaultIntervals.size).toBe(1);

    setTabHidden(true);
    await expect(liveDefaultIntervals.size).toBe(0);

    setTabHidden(false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await expect(liveDefaultIntervals.size).toBe(1);

    await settle();
    await expect(fetchMock).toHaveBeenCalledTimes(2);
  }
);

DefaultIntervalTabHidden.test("A visibilitychange while the tab is still hidden checks nothing", async () => {
  setTabHidden(true);
  setTabHidden(true);
  await settle();

  await expect(fetchMock).not.toHaveBeenCalled();
  await expect(liveDefaultIntervals.size).toBe(0);
});

export const Removable = meta.story({
  args: { intervalMs: FAST_INTERVAL_MS },
  render: (args) => <RemovableStatus {...args} />
});

Removable.test(
  "Stops polling, aborts the request in flight and drops its listener when removed",
  async ({ canvas, userEvent }) => {
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;

    await userEvent.click(canvas.getByRole("button", { name: /remove status/i }));
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    await expect(signal?.aborted).toBe(true);

    fetchMock.mockClear();
    setTabHidden(true);
    setTabHidden(false);
    await settle();

    await expect(fetchMock).not.toHaveBeenCalled();
  }
);

DefaultIntervalTabHidden.test("A second visibilitychange while visible does not start a second timer", async () => {
  setTabHidden(false);
  await waitFor(() => expect(liveDefaultIntervals.size).toBe(1));

  setTabHidden(false);
  await settle();

  await expect(liveDefaultIntervals.size).toBe(1);
});

function answerAt(index: number, body: unknown) {
  pendingAnswers[index]?.(Response.json(body));
}

function checkNow() {
  document.dispatchEvent(new Event("visibilitychange"));
}

export const OverlappingChecks = meta.story({
  args: { intervalMs: DEFAULT_INTERVAL_MS * 10 }
});

OverlappingChecks.test("Lets the newest answer win over a slower, older one", async ({ canvas }) => {
  checkNow();
  checkNow();
  await waitFor(() => expect(pendingAnswers).toHaveLength(2));

  answerAt(1, { host: "localhost:8000", status: "unavailable" });
  await expect(await canvas.findByText("API unavailable")).toBeVisible();

  answerAt(0, { host: "localhost:8000", status: "connected" });
  await settle();

  await expect(canvas.getByText("API unavailable")).toBeVisible();
});

OverlappingChecks.test("Aborts the older request when a newer check starts, leaving one in flight", async () => {
  checkNow();
  checkNow();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  const [older, newer] = fetchMock.mock.calls.map(([, init]) => init?.signal);

  await expect(older?.aborted).toBe(true);
  await expect(newer?.aborted).toBe(false);
});

export const RequestTimeout = meta.story({
  args: { intervalMs: DEFAULT_INTERVAL_MS * 10 },
  beforeEach: () => {
    const timeout = spyOn(AbortSignal, "timeout").mockImplementation(() =>
      AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError"))
    );
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          reject(init?.signal?.reason);
        })
    );

    return () => timeout.mockRestore();
  }
});

RequestTimeout.test("Reports unavailable when a check times out, instead of waiting for ever", async ({ canvas }) => {
  checkNow();

  await expect(await canvas.findByText("API unavailable")).toBeVisible();
});
