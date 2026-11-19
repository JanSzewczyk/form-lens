import { Status, StatusIndicator, StatusLabel } from "@szum-tech/design-system";
import { connection } from "next/server";

import { checkApiHealth } from "~/lib/api-health";

import { ApiStatusLive } from "./api-status-live";

/**
 * The API status box. It reads the state per request (`connection()`), so no route is prerendered with the
 * health the API had at build time, and the layout wraps it in Suspense so a slow API never blocks the page.
 */
export async function ApiStatus() {
  await connection();
  const initial = await checkApiHealth();

  return <ApiStatusLive initial={initial} />;
}

export function ApiStatusFallback() {
  return (
    <div className="flex flex-col gap-2" role="status">
      <Status>
        <StatusIndicator />
        <StatusLabel>Checking API</StatusLabel>
      </Status>
    </div>
  );
}
