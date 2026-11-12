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

const template = { id: "t-1", name: "Invoice", version: 2 } as TemplateResponse;

describe("loadTemplates", () => {
  beforeEach(() => {
    listTemplates.mockReset();
  });

  it("returns the items and the total of a 200", async () => {
    listTemplates.mockResolvedValue({ data: { items: [template], limit: 20, offset: 0, total: 41 }, status: 200 });

    await expect(loadTemplates()).resolves.toEqual({ status: "ok", templates: [template], total: 41 });
  });

  it("reports a Problem Details answer as unavailable with its title", async () => {
    listTemplates.mockResolvedValue({ data: { title: "Unprocessable content" }, status: 422 });

    await expect(loadTemplates()).resolves.toEqual({ reason: "Unprocessable content", status: "unavailable" });
  });

  it("reports an unreachable API as unavailable instead of throwing", async () => {
    listTemplates.mockRejectedValue(new TypeError("fetch failed"));

    await expect(loadTemplates()).resolves.toEqual({
      reason: "The FormLens API does not answer.",
      status: "unavailable"
    });
  });
});
