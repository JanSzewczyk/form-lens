import { afterEach, beforeEach, describe, expect, test as it, vi } from "vitest";

import { TOAST_COOKIE_MAX_AGE, TOAST_COOKIE_NAME } from "~/lib/toast/constants";
import { ToastType } from "~/lib/toast/types";

const next = vi.hoisted(() => ({ set: vi.fn() }));

// The request's cookie store only exists inside a Next.js request; this is the boundary the module writes to.
vi.mock("next/headers", () => ({ cookies: async () => ({ set: next.set }) }));

/** The module reads `NODE_ENV` through the env object when it runs, so each case loads a fresh copy. */
async function loadSetToastCookie() {
  vi.resetModules();
  return (await import("~/lib/toast/server/toast.cookie")).setToastCookie;
}

describe("setToastCookie", () => {
  beforeEach(() => {
    next.set.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes the message and a success type under the toast cookie name", async () => {
    const setToastCookie = await loadSetToastCookie();

    await setToastCookie("Form created");

    expect(next.set).toHaveBeenCalledTimes(1);
    const [name, value] = next.set.mock.calls[0] ?? [];
    expect(name).toBe(TOAST_COOKIE_NAME);
    expect(JSON.parse(value)).toEqual({ message: "Form created", type: ToastType.success });
  });

  it("writes the type it is given", async () => {
    const setToastCookie = await loadSetToastCookie();

    await setToastCookie("Something is off", ToastType.warning);

    const [, value] = next.set.mock.calls[0] ?? [];
    expect(JSON.parse(value)).toEqual({ message: "Something is off", type: ToastType.warning });
  });

  it("lets the browser read and clear it, keeps it to the whole site and expires it quickly", async () => {
    const setToastCookie = await loadSetToastCookie();

    await setToastCookie("Form saved");

    const [, , options] = next.set.mock.calls[0] ?? [];
    expect(options).toMatchObject({ httpOnly: false, maxAge: TOAST_COOKIE_MAX_AGE, path: "/", sameSite: "lax" });
  });

  it("marks the cookie secure only in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const inProduction = await loadSetToastCookie();
    await inProduction("Form saved");
    expect(next.set.mock.calls[0]?.[2]).toMatchObject({ secure: true });

    next.set.mockReset();
    vi.stubEnv("NODE_ENV", "development");
    const inDevelopment = await loadSetToastCookie();
    await inDevelopment("Form saved");
    expect(next.set.mock.calls[0]?.[2]).toMatchObject({ secure: false });
  });
});
