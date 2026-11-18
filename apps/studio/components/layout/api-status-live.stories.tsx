import { expect, fn, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";
import type { ApiHealth } from "~/lib/api-health-types";

import { ApiStatusLive } from "./api-status-live";

const STATUS_ENDPOINT = "/api/formlens-status";
const CONNECTED: ApiHealth = { host: "localhost:8000", status: "connected" };
const UNAVAILABLE: ApiHealth = { host: "localhost:8000", status: "unavailable" };
const FAST_INTERVAL_MS = 30;
const SETTLE_MS = 300;

const fetchMock = fn<typeof fetch>();
/** Requests the component sent that the test has not answered yet. */
const pendingAnswers: Array<(response: Response) => void> = [];

function answerNext(body: unknown) {
  pendingAnswers.shift()?.(Response.json(body));
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
      <div className="bg-sidebar w-60 p-4">
        <Story />
      </div>
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
  pendingAnswers.shift()?.(new Response("boom", { status: 500 }));

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
