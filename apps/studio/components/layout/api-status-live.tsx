"use client";

import { Status, StatusIndicator, StatusLabel } from "@szum-tech/design-system";
import * as React from "react";

import { type ApiHealth, ApiHealthStatus } from "~/lib/api-health-types";

const STATUS_ENDPOINT = "/api/formlens-status";
const DEFAULT_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5000;

type ApiStatusLiveProps = {
  /** The state the server rendered; shown until the first poll answers. */
  initial: ApiHealth;
  /** Time between checks. Only tests change it: Storybook has no fake timers. */
  intervalMs?: number;
};

function isApiHealth(value: unknown): value is ApiHealth {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value.status === ApiHealthStatus.connected || value.status === ApiHealthStatus.unavailable) &&
    "host" in value &&
    typeof value.host === "string"
  );
}

async function fetchHealth(signal: AbortSignal): Promise<ApiHealth | null> {
  const response = await fetch(STATUS_ENDPOINT, { cache: "no-store", signal });
  if (!response.ok) {
    return null;
  }
  const body: unknown = await response.json();
  return isApiHealth(body) ? body : null;
}

/**
 * A client component because it owns a timer and listens to tab visibility. The server supplied the first state, so
 * it does not check on mount. It checks every `intervalMs` while the tab is visible, stops while it is hidden,
 * and checks once when the tab becomes visible again. Only the newest request counts: starting a check aborts the
 * previous one and drops its answer, and every request times out after 5 s.
 */
export function ApiStatusLive({ initial, intervalMs = DEFAULT_INTERVAL_MS }: ApiStatusLiveProps) {
  const [health, setHealth] = React.useState(initial);

  React.useEffect(() => {
    /** The newest request. A check that is no longer the newest was superseded (or unmounted) and is ignored. */
    let latest: AbortController | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function check() {
      latest?.abort();
      const controller = new AbortController();
      latest = controller;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);

      try {
        const next = await fetchHealth(signal);
        if (latest === controller) {
          setHealth((current) => next ?? { host: current.host, status: ApiHealthStatus.unavailable });
        }
      } catch {
        // A timeout still counts as "unavailable"; only a superseded or unmounted request is dropped.
        if (latest === controller) {
          setHealth((current) => ({ host: current.host, status: ApiHealthStatus.unavailable }));
        }
      }
    }

    function stop() {
      clearInterval(timer);
      timer = undefined;
    }

    function start() {
      stop();
      timer = setInterval(() => void check(), intervalMs);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stop();
        return;
      }
      void check();
      start();
    }

    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      latest?.abort();
      latest = undefined;
    };
  }, [intervalMs]);

  const isConnected = health.status === ApiHealthStatus.connected;

  return (
    <div className="flex min-w-0 flex-col gap-2" role="status">
      <Status variant={isConnected ? "success" : "error"}>
        <StatusIndicator />
        <StatusLabel>{isConnected ? "API connected" : "API unavailable"}</StatusLabel>
      </Status>
      <p className="font-code text-small truncate" title={health.host}>
        {health.host}
      </p>
    </div>
  );
}
