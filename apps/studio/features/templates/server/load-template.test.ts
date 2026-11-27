import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { fieldSpecBuilder, templateResponseBuilder } from "~/features/templates/utils/template.builder";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { loadTemplate } from "./load-template";

const ID = "6f1c1b5e-0f0e-4b1e-9d36-3f0d8f9c2a10";

/** Answers every request with a 500 and records its URL, so a test can show that nothing was sent. */
function recordApiRequests(): Array<string> {
  const sent: Array<string> = [];
  server.use(
    http.all("*", ({ request }) => {
      sent.push(request.url);
      return problem(500);
    })
  );
  return sent;
}

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

    await expect(loadTemplate("44444444-4444-4444-8444-444444444444")).resolves.toEqual({ status: "not-found" });
  });

  it.each([["not-a-uuid"], ["../extractions"], ["..%2Fextractions"], [`${ID}/../../extractions`]])(
    "reports the id %j as not found without sending it to the API",
    async (id) => {
      const sent = recordApiRequests();

      await expect(loadTemplate(id)).resolves.toEqual({ status: "not-found" });
      expect(sent).toEqual([]);
    }
  );

  it("reports a 200 of an unexpected shape as unavailable", async () => {
    server.use(http.get(apiUrl(`/v1/templates/${ID}`), () => HttpResponse.json({ id: ID, name: 7 })));

    await expect(loadTemplate(ID)).resolves.toEqual({
      reason: "The FormLens API answered with an unexpected template.",
      status: "unavailable"
    });
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

  it.each([
    ["the empty id", ""],
    ["a UUID with spaces around it", ` ${ID} `],
    ["a UUID with a trailing newline", `${ID}\n`],
    ["a UUID followed by a query", `${ID}?x=1`],
    ["an upper-case path", "../EXTRACTIONS"]
  ])("reports %s as not found without sending it to the API", async (_case, id) => {
    const sent = recordApiRequests();

    await expect(loadTemplate(id)).resolves.toEqual({ status: "not-found" });
    expect(sent).toEqual([]);
  });

  it.each([
    ["an upper-case UUID", ID.toUpperCase()],
    ["a UUIDv7 as the API creates it", "019a6f3e-8c2b-7d41-9a3e-5b2c1d0e4f6a"],
    ["an upper-case UUIDv7", "019A6F3E-8C2B-7D41-9A3E-5B2C1D0E4F6A"]
  ])("sends %s to the API as it is", async (_case, id) => {
    const paths: Array<string> = [];
    server.use(
      http.get(apiUrl("/v1/templates/:id"), ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return problem(404, { title: "Template not found" });
      })
    );

    await expect(loadTemplate(id)).resolves.toEqual({ status: "not-found" });
    expect(paths).toEqual([`/v1/templates/${id}`]);
  });

  it("returns the template of a 200 for an upper-case UUID", async () => {
    const id = ID.toUpperCase();
    const template = templateResponseBuilder.one({ overrides: { id, name: "VAT invoice" } });
    server.use(http.get(apiUrl(`/v1/templates/${id}`), () => HttpResponse.json(template)));

    await expect(loadTemplate(id)).resolves.toEqual({ status: "found", template });
  });

  it.each([
    ["a null body", () => HttpResponse.json(null)],
    ["a list", () => HttpResponse.json([templateResponseBuilder.one({ overrides: { id: ID } })])],
    [
      "a template without fields",
      () => {
        const { fields: _fields, ...rest } = templateResponseBuilder.one({ overrides: { id: ID } });
        return HttpResponse.json(rest);
      }
    ],
    [
      "a field of an unknown type",
      () =>
        HttpResponse.json(
          templateResponseBuilder.one({
            overrides: { fields: [{ ...fieldSpecBuilder.one(), type: "signature" as never }], id: ID }
          })
        )
    ],
    [
      "a string version",
      () => HttpResponse.json({ ...templateResponseBuilder.one({ overrides: { id: ID } }), version: "3" })
    ],
    ["an HTML page", () => HttpResponse.html("<html><body>Gateway</body></html>")],
    ["an empty body", () => new HttpResponse(null, { status: 200 })]
  ])("reports a 200 with %s as unavailable instead of a template", async (_case, answer) => {
    server.use(http.get(apiUrl(`/v1/templates/${ID}`), answer));

    const result = await loadTemplate(ID);

    expect(result.status).toBe("unavailable");
  });

  it.each([[500], [502], [400], [401], [403]])("reports a %i as unavailable, not as not found", async (status) => {
    server.use(http.get(apiUrl(`/v1/templates/${ID}`), () => problem(status)));

    await expect(loadTemplate(ID)).resolves.toEqual({
      reason: "The FormLens API refused the request.",
      status: "unavailable"
    });
  });
});
