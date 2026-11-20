import { afterEach, beforeEach, describe, expect, test as it, vi } from "vitest";

import { TOAST_COOKIE_NAME } from "~/lib/toast/constants";
import { readAndClearToastCookie } from "~/lib/toast/read-toast-cookie";
import { ToastType } from "~/lib/toast/types";

/**
 * The unit project runs in Node, so `document.cookie` is a small jar here: it keeps `name=value` pairs, joins them
 * with "; " and deletes a name when it is written with `Max-Age=0`, as a browser does.
 */
function stubCookieJar(initial: Record<string, string>) {
  const jar = new Map(Object.entries(initial));
  vi.stubGlobal("document", {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(line: string) {
      const [pair = "", ...attributes] = line.split("; ");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      if (attributes.includes("Max-Age=0")) {
        jar.delete(name);
      } else {
        jar.set(name, pair.slice(separator + 1));
      }
    }
  });
  return jar;
}

function toastCookie(payload: unknown): string {
  return encodeURIComponent(JSON.stringify(payload));
}

describe("readAndClearToastCookie", () => {
  beforeEach(() => {
    stubCookieJar({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when there is no toast cookie and leaves other cookies alone", () => {
    const jar = stubCookieJar({ theme: "dark" });

    expect(readAndClearToastCookie()).toBeNull();
    expect(jar.get("theme")).toBe("dark");
  });

  it("returns the message and type, and removes the cookie so it fires once", () => {
    const jar = stubCookieJar({ [TOAST_COOKIE_NAME]: toastCookie({ message: "Form saved", type: "success" }) });

    expect(readAndClearToastCookie()).toEqual({ message: "Form saved", type: ToastType.success });
    expect(jar.has(TOAST_COOKIE_NAME)).toBe(false);
    expect(readAndClearToastCookie()).toBeNull();
  });

  it("finds the cookie among others and leaves them in place", () => {
    const jar = stubCookieJar({
      a: "1",
      [TOAST_COOKIE_NAME]: toastCookie({ message: "Form deleted", type: "info" }),
      z: "2"
    });

    expect(readAndClearToastCookie()).toEqual({ message: "Form deleted", type: ToastType.info });
    expect([...jar.keys()]).toEqual(["a", "z"]);
  });

  it("does not take a cookie whose name only starts like the toast cookie", () => {
    const jar = stubCookieJar({
      [`${TOAST_COOKIE_NAME}_other`]: toastCookie({ message: "Not mine", type: "success" })
    });

    expect(readAndClearToastCookie()).toBeNull();
    expect(jar.size).toBe(1);
  });

  it("reads a message with quotes, semicolons and non-ASCII text", () => {
    const message = 'Form "Faktura; zażółć" saved';
    stubCookieJar({ [TOAST_COOKIE_NAME]: toastCookie({ message, type: "success" }) });

    expect(readAndClearToastCookie()?.message).toBe(message);
  });

  it.each([
    ["not JSON", "%7Bnot%20json"],
    ["JSON null", toastCookie(null)],
    ["a JSON string", toastCookie("Form saved")],
    ["a payload with no message", toastCookie({ type: "success" })],
    ["a payload with no type", toastCookie({ message: "Form saved" })],
    ["a message that is not text", toastCookie({ message: 5, type: "success" })],
    ["a type that is not a toast type", toastCookie({ message: "Form saved", type: "danger" })],
    ["an invalid percent escape", "%E0%A4%A"]
  ])("shows nothing for %s, and still clears the cookie", (_name, value) => {
    const jar = stubCookieJar({ [TOAST_COOKIE_NAME]: value });

    expect(readAndClearToastCookie()).toBeNull();
    expect(jar.has(TOAST_COOKIE_NAME)).toBe(false);
  });
});
