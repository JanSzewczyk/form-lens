import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { templateResponseBuilder } from "~/features/templates/utils/template.builder";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { loadTemplate } from "./load-template";

const ID = "6f1c1b5e-0f0e-4b1e-9d36-3f0d8f9c2a10";

describe("loadTemplate", () => {
  beforeEach(() => {
    resetLog();
  });

  it("returns the template of a 200", async () => {
    const template = templateResponseBuilder.one({ overrides: { id: ID } });
    server.use(http.get(apiUrl(`/v1/templates/${ID}`), () => HttpResponse.json(template)));

    await expect(loadTemplate(ID)).resolves.toEqual({ status: "found", template });
  });

  it("reports a 404 as not found (AC21)", async () => {
    server.use(http.get(apiUrl("/v1/templates/:id"), () => problem(404, { title: "Template not found" })));

    await expect(loadTemplate("11111111-1111-4111-8111-111111111111")).resolves.toEqual({ status: "not-found" });
  });

  it("reports an id the API cannot read as a template id (422) as not found (AC21)", async () => {
    server.use(http.get(apiUrl("/v1/templates/:id"), () => problem(422, { title: "Request validation failed" })));

    await expect(loadTemplate("not-a-uuid")).resolves.toEqual({ status: "not-found" });
  });

  it("reports another status as unavailable", async () => {
    server.use(http.get(apiUrl("/v1/templates/:id"), () => problem(503, { title: "Service not ready" })));

    await expect(loadTemplate("22222222-2222-4222-8222-222222222222")).resolves.toEqual({
      reason: "The FormLens API refused the request.",
      status: "unavailable"
    });
  });

  it("reports an unreachable API as unavailable instead of throwing", async () => {
    server.use(http.get(apiUrl("/v1/templates/:id"), () => HttpResponse.error()));

    await expect(loadTemplate("33333333-3333-4333-8333-333333333333")).resolves.toEqual({
      reason: "The FormLens API does not answer.",
      status: "unavailable"
    });
  });
});
