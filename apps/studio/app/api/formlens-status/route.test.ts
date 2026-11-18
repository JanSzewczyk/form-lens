import { beforeEach, describe, expect, test as it, vi } from "vitest";

const checkApiHealth = vi.hoisted(() => vi.fn());

vi.mock("~/lib/api-health", () => ({ checkApiHealth }));

import { GET } from "./route";

describe("GET /api/formlens-status", () => {
  beforeEach(() => {
    checkApiHealth.mockReset();
  });

  it("answers the connected state with the API host", async () => {
    checkApiHealth.mockResolvedValue({ host: "localhost:8000", status: "connected" });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ host: "localhost:8000", status: "connected" });
  });

  it("answers the unavailable state with 200, so the poller can tell it from a Studio failure", async () => {
    checkApiHealth.mockResolvedValue({ host: "localhost:8000", status: "unavailable" });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ host: "localhost:8000", status: "unavailable" });
  });

  it("is never cached", async () => {
    checkApiHealth.mockResolvedValue({ host: "localhost:8000", status: "connected" });

    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
