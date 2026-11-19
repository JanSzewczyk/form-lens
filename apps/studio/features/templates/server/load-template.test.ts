import type { TemplateResponse } from "@form-lens/api-client";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

const getTemplate = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("~/lib/formlens-api", () => ({ getTemplate }));
vi.mock("~/lib/logger", () => {
  const logger = { warn: vi.fn(), withError: vi.fn(), withMetadata: vi.fn() };
  logger.withError.mockReturnValue(logger);
  logger.withMetadata.mockReturnValue(logger);
  return { createLogger: () => logger, default: logger };
});

import { loadTemplate } from "./load-template";

const template = { id: "t-1", name: "Invoice", version: 2 } as TemplateResponse;

describe("loadTemplate", () => {
  beforeEach(() => {
    getTemplate.mockReset();
  });

  it("returns the template of a 200", async () => {
    getTemplate.mockResolvedValue({ data: template, status: 200 });

    await expect(loadTemplate("t-1")).resolves.toEqual({ status: "found", template });
    expect(getTemplate).toHaveBeenCalledWith("t-1", expect.objectContaining({ cache: "no-store" }));
  });

  it("reports a 404 as not found (AC21)", async () => {
    getTemplate.mockResolvedValue({ data: { status: 404, title: "Template not found" }, status: 404 });

    await expect(loadTemplate("missing")).resolves.toEqual({ status: "not-found" });
  });

  it("reports an id the API cannot read as a template id (422) as not found (AC21)", async () => {
    getTemplate.mockResolvedValue({ data: { status: 422, title: "Request validation failed" }, status: 422 });

    await expect(loadTemplate("not-a-uuid")).resolves.toEqual({ status: "not-found" });
  });

  it("reports another status as unavailable", async () => {
    getTemplate.mockResolvedValue({ data: { status: 503, title: "Service not ready" }, status: 503 });

    await expect(loadTemplate("t-1")).resolves.toEqual({
      reason: "The FormLens API refused the request.",
      status: "unavailable"
    });
  });

  it("reports an unreachable API as unavailable instead of throwing", async () => {
    getTemplate.mockRejectedValue(new TypeError("fetch failed"));

    await expect(loadTemplate("t-1")).resolves.toEqual({
      reason: "The FormLens API does not answer.",
      status: "unavailable"
    });
  });
});
