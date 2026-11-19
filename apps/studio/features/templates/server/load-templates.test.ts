import type { TemplateResponse } from "@form-lens/api-client";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

const listTemplates = vi.hoisted(() => vi.fn());

vi.mock("~/lib/formlens-api", () => ({ listTemplates }));
vi.mock("~/lib/logger", () => {
  const logger = { warn: vi.fn(), withError: vi.fn(), withMetadata: vi.fn() };
  logger.withError.mockReturnValue(logger);
  logger.withMetadata.mockReturnValue(logger);
  return { default: logger };
});

import { loadTemplates } from "./load-templates";

const firstPage = { page: 1, search: "" };
const template = { id: "t-1", name: "Invoice", version: 2 } as TemplateResponse;

describe("loadTemplates", () => {
  beforeEach(() => {
    listTemplates.mockReset();
  });

  it("returns the items, the total and the page size of a 200", async () => {
    listTemplates.mockResolvedValue({ data: { items: [template], limit: 12, offset: 0, total: 41 }, status: 200 });

    await expect(loadTemplates(firstPage)).resolves.toEqual({
      pageSize: 12,
      status: "ok",
      templates: [template],
      total: 41
    });
  });

  it("forwards the search to the API", async () => {
    listTemplates.mockResolvedValue({ data: { items: [], limit: 12, offset: 0, total: 0 }, status: 200 });

    await loadTemplates({ page: 1, search: "invoice" });

    expect(listTemplates).toHaveBeenCalledWith(
      { limit: 12, offset: 0, search: "invoice" },
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("leaves the search out when it is empty", async () => {
    listTemplates.mockResolvedValue({ data: { items: [], limit: 12, offset: 0, total: 0 }, status: 200 });

    await loadTemplates(firstPage);

    expect(listTemplates.mock.calls[0]?.[0]).toEqual({ limit: 12, offset: 0, search: undefined });
  });

  it("maps page 3 to an offset of two pages", async () => {
    listTemplates.mockResolvedValue({ data: { items: [], limit: 12, offset: 24, total: 30 }, status: 200 });

    await loadTemplates({ page: 3, search: "" });

    expect(listTemplates.mock.calls[0]?.[0]).toMatchObject({ limit: 12, offset: 24 });
  });

  it("reports a Problem Details answer as unavailable with its title", async () => {
    listTemplates.mockResolvedValue({ data: { title: "Unprocessable content" }, status: 422 });

    await expect(loadTemplates(firstPage)).resolves.toEqual({ reason: "Unprocessable content", status: "unavailable" });
  });

  it("reports an unreachable API as unavailable instead of throwing", async () => {
    listTemplates.mockRejectedValue(new TypeError("fetch failed"));

    await expect(loadTemplates(firstPage)).resolves.toEqual({
      reason: "The FormLens API does not answer.",
      status: "unavailable"
    });
  });

  it("sends no search for a whitespace-only one (stricter reading: the loader does not rely on its caller to trim)", async () => {
    listTemplates.mockResolvedValue({ data: { items: [], limit: 12, offset: 0, total: 0 }, status: 200 });

    await loadTemplates({ page: 1, search: "   " });

    expect(listTemplates.mock.calls[0]?.[0]).toMatchObject({ search: undefined });
  });

  it("gives a readable reason when the refusal carries no Problem Details title", async () => {
    listTemplates.mockResolvedValue({ data: {}, status: 502 });

    const result = await loadTemplates(firstPage);

    expect(result).toMatchObject({ status: "unavailable" });
    expect((result as { reason: unknown }).reason).toEqual(expect.stringMatching(/\S/));
  });

  it("reports a refusal whose body is empty as unavailable instead of throwing", async () => {
    listTemplates.mockResolvedValue({ data: null, status: 500 });

    await expect(loadTemplates(firstPage)).resolves.toMatchObject({ status: "unavailable" });
  });

  it("keeps an empty last page an ok result with its total", async () => {
    listTemplates.mockResolvedValue({ data: { items: [], limit: 12, offset: 96, total: 30 }, status: 200 });

    await expect(loadTemplates({ page: 9, search: "" })).resolves.toEqual({
      pageSize: 12,
      status: "ok",
      templates: [],
      total: 30
    });
  });

  it("gives the request a 3 s timeout signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    listTemplates.mockResolvedValue({ data: { items: [], limit: 12, offset: 0, total: 0 }, status: 200 });

    await loadTemplates(firstPage);

    expect(timeout).toHaveBeenCalledWith(3000);
    expect(listTemplates.mock.calls[0]?.[1]).toMatchObject({ signal: timeout.mock.results[0]?.value });
  });

  it("reports a stalled API as unavailable once the timeout signal aborts, instead of waiting for it", async () => {
    vi.useFakeTimers();
    try {
      listTemplates.mockImplementation(
        (_params: unknown, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(options.signal.reason));
          })
      );

      const pending = loadTemplates(firstPage);
      await vi.advanceTimersByTimeAsync(3000);

      await expect(pending).resolves.toEqual({
        reason: "The FormLens API does not answer.",
        status: "unavailable"
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
