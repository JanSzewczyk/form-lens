import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

const checkApiHealth = vi.hoisted(() => vi.fn());
const connection = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("~/lib/api-health", () => ({ checkApiHealth }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection
}));

import { ApiStatus, ApiStatusFallback } from "./api-status";

describe("ApiStatus (server-rendered first state)", () => {
  beforeEach(() => {
    checkApiHealth.mockReset();
    connection.mockReset();
    connection.mockResolvedValue(undefined);
  });

  it("renders API connected with the host when the health check is connected", async () => {
    checkApiHealth.mockResolvedValue({ host: "api.internal:8000", status: "connected" });

    const html = renderToStaticMarkup(await ApiStatus());

    expect(html).toContain("API connected");
    expect(html).toContain("api.internal:8000");
    expect(html).not.toContain("API unavailable");
  });

  it("renders API unavailable with the host when the health check is unavailable", async () => {
    checkApiHealth.mockResolvedValue({ host: "api.internal:8000", status: "unavailable" });

    const html = renderToStaticMarkup(await ApiStatus());

    expect(html).toContain("API unavailable");
    expect(html).toContain("api.internal:8000");
    expect(html).not.toContain("API connected");
  });

  it("opts into per-request rendering before it asks the API", async () => {
    checkApiHealth.mockResolvedValue({ host: "h:1", status: "connected" });

    await ApiStatus();

    expect(connection).toHaveBeenCalledOnce();
    expect(connection.mock.invocationCallOrder[0]).toBeLessThan(checkApiHealth.mock.invocationCallOrder[0] ?? 0);
  });
});

describe("ApiStatusFallback", () => {
  it("says the API is being checked, without claiming a state", () => {
    const html = renderToStaticMarkup(<ApiStatusFallback />);

    expect(html).toContain("Checking API");
    expect(html).not.toContain("API connected");
    expect(html).not.toContain("API unavailable");
  });
});
