import { describe, expect, test as it } from "vitest";

import { ExtractionViewStatus } from "~/features/extractions/schemas/extraction";

import { getStatusSummary, StatusStepState } from "./status-steps";

function statesOf(status: ExtractionViewStatus) {
  return getStatusSummary(status).steps.map((step) => [step.title, step.state]);
}

describe("getStatusSummary", () => {
  it("shows Uploaded done and Waiting in queue current for a pending extraction, badge Waiting (AC19)", () => {
    expect(statesOf(ExtractionViewStatus.pending)).toEqual([
      ["Uploaded", StatusStepState.completed],
      ["Waiting in queue", StatusStepState.current],
      ["Reading document", StatusStepState.upcoming],
      ["Done", StatusStepState.upcoming]
    ]);
    expect(getStatusSummary(ExtractionViewStatus.pending).badge.label).toBe("Waiting");
  });

  it("shows Reading document current for a running extraction (AC20)", () => {
    expect(statesOf(ExtractionViewStatus.running)).toEqual([
      ["Uploaded", StatusStepState.completed],
      ["Waiting in queue", StatusStepState.completed],
      ["Reading document", StatusStepState.current],
      ["Done", StatusStepState.upcoming]
    ]);
    expect(getStatusSummary(ExtractionViewStatus.running).badge.label).toBe("In progress");
  });

  it.each([
    [ExtractionViewStatus.completed, "Done", "Completed"],
    [ExtractionViewStatus.failed, "Failed", "Failed"],
    [ExtractionViewStatus.cancelled, "Cancelled", "Cancelled"]
  ])("ends a %s extraction with every step done, the last one named %s", (status, lastTitle, badge) => {
    const { steps, badge: summaryBadge } = getStatusSummary(status);

    expect(steps.map((step) => step.state)).toEqual([
      StatusStepState.completed,
      StatusStepState.completed,
      StatusStepState.completed,
      StatusStepState.completed
    ]);
    expect(steps.at(-1)?.title).toBe(lastTitle);
    expect(summaryBadge.label).toBe(badge);
  });
});
