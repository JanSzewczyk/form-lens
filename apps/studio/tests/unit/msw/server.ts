import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

/** The address the unit tests give the API client (`FORMLENS_API_URL`); its path is ignored by the client. */
export const API_URL = "http://api.internal:8000/base";

/** The URL of an API path, as the client builds it. */
export function apiUrl(path: string): string {
  return new URL(path, API_URL).toString();
}

/**
 * The test server. It starts with no handler, so a request nobody expected fails the test (`onUnhandledFrame`); a test
 * adds the answers it needs with `server.use(...)`, and they are dropped after each test.
 */
export const server = setupServer();

/** A Problem Details answer, as the API sends its errors. */
export function problem(status: number, body: Record<string, unknown> = {}) {
  return HttpResponse.json({ status, title: "Problem", ...body }, { status });
}

export { HttpResponse, http };
