import { ExtractionViewStatus } from "~/features/extractions/schemas/extraction";

export const StatusStepState = {
  completed: "completed",
  current: "current",
  upcoming: "upcoming"
} as const;

export type StatusStepState = (typeof StatusStepState)[keyof typeof StatusStepState];

type StatusStep = { key: string; state: StatusStepState; title: string };

type StatusBadgeVariant = "primary" | "secondary" | "success" | "error";

type StatusSummary = {
  badge: { label: string; variant: StatusBadgeVariant };
  /** The h4 line of the status card. */
  headline: string;
  steps: Array<StatusStep>;
};

const FINAL_STEP_TITLE: Record<ExtractionViewStatus, string> = {
  [ExtractionViewStatus.cancelled]: "Cancelled",
  [ExtractionViewStatus.completed]: "Done",
  [ExtractionViewStatus.failed]: "Failed",
  [ExtractionViewStatus.pending]: "Done",
  [ExtractionViewStatus.running]: "Done"
};

/** How many of the four steps are behind the extraction; the step at that index is the current one. */
const STEPS_BEHIND: Record<ExtractionViewStatus, number> = {
  [ExtractionViewStatus.cancelled]: 4,
  [ExtractionViewStatus.completed]: 4,
  [ExtractionViewStatus.failed]: 4,
  [ExtractionViewStatus.pending]: 1,
  [ExtractionViewStatus.running]: 2
};

const BADGE: Record<ExtractionViewStatus, StatusSummary["badge"]> = {
  [ExtractionViewStatus.cancelled]: { label: "Cancelled", variant: "secondary" },
  [ExtractionViewStatus.completed]: { label: "Completed", variant: "success" },
  [ExtractionViewStatus.failed]: { label: "Failed", variant: "error" },
  [ExtractionViewStatus.pending]: { label: "Waiting", variant: "secondary" },
  [ExtractionViewStatus.running]: { label: "In progress", variant: "primary" }
};

const HEADLINE: Record<ExtractionViewStatus, string> = {
  [ExtractionViewStatus.cancelled]: "The extraction was cancelled",
  [ExtractionViewStatus.completed]: "The document has been read",
  [ExtractionViewStatus.failed]: "The extraction failed",
  [ExtractionViewStatus.pending]: "Waiting in queue",
  [ExtractionViewStatus.running]: "Reading document"
};

/** The status stepper (Uploaded → Waiting in queue → Reading document → Done, Failed or Cancelled) and the badge. */
export function getStatusSummary(status: ExtractionViewStatus): StatusSummary {
  const titles = ["Uploaded", "Waiting in queue", "Reading document", FINAL_STEP_TITLE[status]];
  const behind = STEPS_BEHIND[status];

  return {
    badge: BADGE[status],
    headline: HEADLINE[status],
    steps: titles.map((title, index) => ({
      key: `step-${index}`,
      state:
        index < behind
          ? StatusStepState.completed
          : index === behind
            ? StatusStepState.current
            : StatusStepState.upcoming,
      title
    }))
  };
}
