import { beforeEach, describe, expect, test as it, vi } from "vitest";

/** Created before the mock factory runs, so it is the same recorder after `vi.resetModules()` re-imports the env. */
const log = vi.hoisted(() => ({ warn: vi.fn(), withMetadata: vi.fn() }));

vi.mock("~/lib/logger", () => ({ createLogger: () => log }));

import { capUploadLimitMb } from "./server";

beforeEach(() => {
  log.warn.mockReset();
  log.withMetadata.mockReset();
  log.withMetadata.mockReturnValue(log);
});

describe("capUploadLimitMb", () => {
  it("caps a higher runtime value at the build-time limit", () => {
    expect(capUploadLimitMb("50", "25")).toBe(25);
  });

  it("lets the runtime value lower the limit", () => {
    expect(capUploadLimitMb(10, "25")).toBe(10);
  });

  it.each([
    ["missing runtime", undefined, "50", 25],
    ["empty runtime", "", "50", 25],
    ["invalid runtime", "lots", "50", 25],
    ["missing build", "50", undefined, 25],
    ["zero build", "50", "0", 25],
    ["both missing", undefined, undefined, 25],
    ["missing build, lower runtime", "10", undefined, 10]
  ])("counts a %s as the default 25 MB", (_case, runtime, build, expected) => {
    expect(capUploadLimitMb(runtime, build)).toBe(expected);
  });
});

describe("capUploadLimitMb edges", () => {
  it.each([
    ["fractional", "2.5"],
    ["negative", "-5"],
    ["non-numeric", "lots"],
    ["infinite", "Infinity"],
    ["NaN", "NaN"]
  ])("counts a %s build value as the default 25 MB, never above it", (_case, build) => {
    expect(capUploadLimitMb("50", build)).toBe(25);
  });

  it.each([
    ["fractional", "2.5"],
    ["negative", "-5"],
    ["zero", "0"]
  ])("never lets a %s runtime value raise the limit above the build", (_case, runtime) => {
    expect(capUploadLimitMb(runtime, "10")).toBe(10);
  });

  it.each([
    [" 10 ", "25", 10],
    [10, 25, 10],
    ["1e1", "25", 10],
    ["25", "25", 25],
    ["1", "25", 1]
  ])("lets the runtime value %j lower the build limit %j", (runtime, build, expected) => {
    expect(capUploadLimitMb(runtime, build)).toBe(expected);
  });

  it("never returns more than a valid build limit, whatever the runtime asks (AC12)", () => {
    for (const build of [1, 2, 25, 26, 100, 4321]) {
      for (const runtime of [undefined, "", "0", "1", "25", "50", "100000", "lots", "-1", "2.5"]) {
        expect(capUploadLimitMb(runtime, String(build))).toBeLessThanOrEqual(build);
      }
    }
  });
});

describe("maxUploadMb", () => {
  /** A fresh `data/env/server` evaluated with the given runtime and build-time limits. */
  async function importEnvWith(runtime: string, build: string) {
    vi.resetModules();
    vi.stubEnv("FORMLENS_MAX_UPLOAD_MB", runtime);
    vi.stubEnv("FORMLENS_BUILD_MAX_UPLOAD_MB", build);
    try {
      return await import("./server");
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it("caps the runtime 50 MB at the build-time 25 MB (AC12)", async () => {
    expect((await importEnvWith("50", "25")).maxUploadMb).toBe(25);
  });

  it("takes a runtime value lower than the build limit (AC12)", async () => {
    expect((await importEnvWith("10", "25")).maxUploadMb).toBe(10);
  });

  it("caps at a build limit above the default", async () => {
    expect((await importEnvWith("50", "40")).maxUploadMb).toBe(40);
  });

  it("warns once, when the env is read, that the runtime value was capped at the build-time limit", async () => {
    await importEnvWith("50", "25");
    await import("./server");

    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalledWith("Upload limit capped at the build-time limit");
    expect(log.withMetadata).toHaveBeenCalledWith({ buildMaxUploadMb: 25, requestedMaxUploadMb: 50 });
  });

  it.each([
    ["lower than", "10", "40"],
    ["equal to", "25", "25"]
  ])("does not warn when the runtime value is %s the build-time limit", async (_case, runtime, build) => {
    await importEnvWith(runtime, build);

    expect(log.warn).not.toHaveBeenCalled();
  });
});
