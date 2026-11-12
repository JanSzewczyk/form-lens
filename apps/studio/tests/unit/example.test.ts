import { describe, expect, test as it } from "vitest";

function sum(a: number, b: number): number {
  return a + b;
}

describe("sum", () => {
  it("adds two positive numbers", () => {
    expect(sum(1, 2)).toBe(3);
  });

  it("adds negative numbers", () => {
    expect(sum(-1, -2)).toBe(-3);
  });

  it("adds zero", () => {
    expect(sum(0, 5)).toBe(5);
  });
});
