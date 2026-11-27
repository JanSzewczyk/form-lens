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
  async function importEnvWith(runtime: string | undefined, build: string | undefined) {
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

describe("maxUploadMb warning edges", () => {
  async function importEnvWith(runtime: string | undefined, build: string | undefined) {
    vi.resetModules();
    vi.stubEnv("FORMLENS_MAX_UPLOAD_MB", runtime);
    vi.stubEnv("FORMLENS_BUILD_MAX_UPLOAD_MB", build);
    try {
      return await import("./server");
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it("warns once when the runtime value is one MB above the build-time limit", async () => {
    const { maxUploadMb } = await importEnvWith("26", "25");

    expect(maxUploadMb).toBe(25);
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.withMetadata).toHaveBeenCalledWith({ buildMaxUploadMb: 25, requestedMaxUploadMb: 26 });
  });

  it("takes an equal value above the default without a warning", async () => {
    const { maxUploadMb } = await importEnvWith("40", "40");

    expect(maxUploadMb).toBe(40);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("uses the default 25 MB without a warning when neither side is set", async () => {
    const { maxUploadMb } = await importEnvWith(undefined, undefined);

    expect(maxUploadMb).toBe(25);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["unset", undefined],
    ["empty", ""]
  ])(
    "does not warn when the runtime value is %s and the build-time limit is below the default (stricter reading of B3)",
    async (_case, runtime) => {
      const { maxUploadMb } = await importEnvWith(runtime, "10");

      expect(maxUploadMb).toBe(10);
      expect(log.warn).not.toHaveBeenCalled();
    }
  );
});

describe("maxUploadMb with env validation on", () => {
  /** A fresh `data/env/server` evaluated as the running app does: env validation on, the schema's default applies. */
  async function importValidatedEnvWith(runtime: string | undefined, build: string | undefined) {
    vi.resetModules();
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("FORMLENS_MAX_UPLOAD_MB", runtime);
    vi.stubEnv("FORMLENS_BUILD_MAX_UPLOAD_MB", build);
    try {
      return await import("./server");
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it("uses the declared default 25 MB when the runtime value is not set", async () => {
    const { env, maxUploadMb } = await importValidatedEnvWith(undefined, "25");

    expect(env.FORMLENS_MAX_UPLOAD_MB).toBe(25);
    expect(maxUploadMb).toBe(25);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("does not warn when the runtime value is not set and the build-time limit is below the default (stricter reading of B3)", async () => {
    const { maxUploadMb } = await importValidatedEnvWith(undefined, "10");

    expect(maxUploadMb).toBe(10);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("caps a higher runtime value at the build-time limit and warns once", async () => {
    const { maxUploadMb } = await importValidatedEnvWith("50", "25");

    expect(maxUploadMb).toBe(25);
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalledWith("Upload limit capped at the build-time limit");
  });

  it.each([["lots"], ["0"], ["-5"], ["2.5"]])(
    "refuses the invalid runtime value %j when the app starts",
    async (runtime) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(importValidatedEnvWith(runtime, "25")).rejects.toThrow("Invalid environment variables");
    }
  );
});

describe("the build-time limit next.config.ts inlines", () => {
  /** A fresh `next.config.ts` evaluated with `FORMLENS_MAX_UPLOAD_MB` as the build sees it. */
  async function importNextConfigWith(build: string | undefined) {
    vi.resetModules();
    vi.stubEnv("FORMLENS_MAX_UPLOAD_MB", build);
    try {
      return (await import("~/next.config")).default;
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it.each([
    ["40", "40", "41mb"],
    ["1", "1", "2mb"],
    [undefined, "25", "26mb"],
    ["", "25", "26mb"],
    ["lots", "25", "26mb"],
    ["0", "25", "26mb"]
  ])("builds with %j as the limit %s MB and a request body limit of %s", async (build, inlined, bodyLimit) => {
    const config = await importNextConfigWith(build);

    expect(config.env.FORMLENS_BUILD_MAX_UPLOAD_MB).toBe(inlined);
    expect(config.experimental.serverActions.bodySizeLimit).toBe(bodyLimit);
    expect(config.experimental.proxyClientMaxBodySize).toBe(bodyLimit);
  });

  it("caps the runtime value at the limit the build inlined, under the name the server reads", async () => {
    const config = await importNextConfigWith("40");
    vi.resetModules();
    vi.stubEnv("FORMLENS_MAX_UPLOAD_MB", "50");
    for (const [name, value] of Object.entries(config.env)) {
      vi.stubEnv(name, value);
    }
    try {
      const { maxUploadMb } = await import("./server");

      expect(maxUploadMb).toBe(40);
      expect(log.withMetadata).toHaveBeenCalledWith({ buildMaxUploadMb: 40, requestedMaxUploadMb: 50 });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
