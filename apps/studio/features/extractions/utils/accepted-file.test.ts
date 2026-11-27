import { describe, expect, test as it } from "vitest";

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
