import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperTitle,
  StepperTrigger
} from "@szum-tech/design-system";

import type { ExtractionViewStatus } from "~/features/extractions/schemas/extraction";
import { getStatusSummary, StatusStepState } from "~/features/extractions/utils/status-steps";

type StatusStepperProps = {
  status: ExtractionViewStatus;
};

/** Where the extraction is: Uploaded → Waiting in queue → Reading document → Done, Failed or Cancelled. */
export function StatusStepper({ status }: StatusStepperProps) {
  const { steps } = getStatusSummary(status);
  const current = steps.find((step) => step.state === StatusStepState.current);

  return (
    <Stepper aria-label="Extraction status" nonInteractive value={current?.key ?? ""}>
      {/* The design system lays a horizontal nav out as a row at every width; below `sm` it is stacked instead. */}
      <StepperNav className="items-start gap-3 data-[orientation=horizontal]:flex-col sm:items-center sm:gap-6 sm:data-[orientation=horizontal]:flex-row">
        {steps.map((step, index) => (
          <StepperItem completed={step.state === StatusStepState.completed} key={step.key} value={step.key}>
            <StepperTrigger>
              <StepperIndicator>{index + 1}</StepperIndicator>
              <StepperTitle>{step.title}</StepperTitle>
            </StepperTrigger>
          </StepperItem>
        ))}
      </StepperNav>
    </Stepper>
  );
}
