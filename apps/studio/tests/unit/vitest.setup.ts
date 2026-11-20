import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { API_URL, server } from "./msw/server";

// `server-only` throws when it is imported outside a Server Component build; here it is a no-op.
vi.mock("server-only", () => ({}));
// Environment validation is skipped in tests, so the API address has no default: the client would get none.
vi.stubEnv("FORMLENS_API_URL", API_URL);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());
