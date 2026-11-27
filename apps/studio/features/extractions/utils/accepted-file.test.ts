import { describe, expect, test as it, vi } from "vitest";

import { capUploadLimitMb } from "~/data/env/server";

import { checkFile, formatFileSize } from "./accepted-file";

const MB = 1024 * 1024;

function file(name: string, type: string, size = 1024) {
  return { name, size, type };
}

describe("checkFile", () => {
  it.each([
    ["invoice.pdf", "application/pdf"],
    ["scan.png", "image/png"],
    ["photo.jpg", "image/jpeg"],
    ["photo.JPEG", "image/jpeg"],
    ["fax.tiff", "image/tiff"],
    ["fax.tif", ""]
  ])("accepts %s (%s)", (name, type) => {
    expect(checkFile(file(name, type), 25)).toBeNull();
  });

  it("refuses a .docx with a message naming the accepted types (AC11)", () => {
    const message = checkFile(
      file("letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      25
    );

    expect(message).toBe("This file type is not supported. Choose a PDF, PNG, JPEG or TIFF file.");
  });

  it("refuses a file without an extension or a type", () => {
    expect(checkFile(file("README", ""), 25)).toMatch(/PDF, PNG, JPEG or TIFF/);
  });

  it("refuses a file over the limit with the limit in MB (AC12)", () => {
    expect(checkFile(file("big.pdf", "application/pdf", 10 * MB + 1), 10)).toBe(
      "The file is larger than 10 MB. Choose a file of up to 10 MB."
    );
  });

  it("accepts a file exactly at the limit", () => {
    expect(checkFile(file("edge.pdf", "application/pdf", 10 * MB), 10)).toBeNull();
  });
});

describe("formatFileSize", () => {
  it.each([
    [2 * MB, "2 MB"],
    [1.5 * MB, "1.5 MB"],
    [350 * 1024, "350 KB"],
    [12, "12 B"]
  ])("shows %d bytes as %s", (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });
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
  async function maxUploadMbWith(runtime: string, build: string) {
    vi.resetModules();
    vi.stubEnv("FORMLENS_MAX_UPLOAD_MB", runtime);
    vi.stubEnv("FORMLENS_BUILD_MAX_UPLOAD_MB", build);
    try {
      return (await import("~/data/env/server")).maxUploadMb;
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it("caps the runtime 50 MB at the build-time 25 MB (AC12)", async () => {
    expect(await maxUploadMbWith("50", "25")).toBe(25);
  });

  it("takes a runtime value lower than the build limit (AC12)", async () => {
    expect(await maxUploadMbWith("10", "25")).toBe(10);
  });

  it("caps at a build limit above the default", async () => {
    expect(await maxUploadMbWith("50", "40")).toBe(40);
  });
});
