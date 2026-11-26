import { SidebarProvider } from "@szum-tech/design-system";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

const connection = vi.hoisted(() => vi.fn());

// `connection()` is Next.js's request marker and throws outside a request; the API itself is faked over HTTP (MSW).
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection
}));
vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);

import { ApiStatus, ApiStatusFallback } from "./api-status";

describe("ApiStatus (server-rendered first state)", () => {
  beforeEach(() => {
    resetLog();
    connection.mockResolvedValue(undefined);
  });

  it("renders API connected with the host when the API is ready (AC3)", async () => {
    server.use(http.get(apiUrl("/health/ready"), () => HttpResponse.json({ status: "ready" })));

    const html = renderToStaticMarkup(<SidebarProvider>{await ApiStatus()}</SidebarProvider>);

    expect(html).toContain("API connected");
    expect(html).toContain("api.internal:8000");
    expect(html).not.toContain("API unavailable");
  });

  it("renders API unavailable with the host when the API is not ready (AC3)", async () => {
    server.use(http.get(apiUrl("/health/ready"), () => problem(503)));

    const html = renderToStaticMarkup(<SidebarProvider>{await ApiStatus()}</SidebarProvider>);

    expect(html).toContain("API unavailable");
    expect(html).toContain("api.internal:8000");
    expect(html).not.toContain("API connected");
  });

  it("opts into per-request rendering before it asks the API", async () => {
    const asked: Array<number> = [];
    server.use(
      http.get(apiUrl("/health/ready"), () => {
        asked.push(connection.mock.calls.length);
        return HttpResponse.json({ status: "ready" });
      })
    );

    await ApiStatus();

    expect(connection).toHaveBeenCalledOnce();
    expect(asked).toEqual([1]);
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
