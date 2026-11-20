import { vi } from "vitest";

/**
 * A LogLayer stand-in that records the calls. A test that asserts on what is logged mocks `~/lib/logger` with
 * `vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule)`.
 */
export const log = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  withError: vi.fn(),
  withMetadata: vi.fn()
};

/** Chained calls (`log.withError(e).withMetadata(m).warn(...)`) keep returning the same recorder. */
export function resetLog() {
  for (const method of Object.values(log)) {
    method.mockReset();
  }
  log.withError.mockReturnValue(log);
  log.withMetadata.mockReturnValue(log);
}

export const loggerModule = { createLogger: () => log, default: log };
