import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperTitle,
  StepperTrigger
} from "@szum-tech/design-system";

export const NewDocumentStep = {
  chooseForm: "choose-form",
  results: "results",
  upload: "upload"
} as const;

export type NewDocumentStep = (typeof NewDocumentStep)[keyof typeof NewDocumentStep];

const STEPS: Array<{ value: NewDocumentStep; title: string }> = [
  { title: "Choose form", value: NewDocumentStep.chooseForm },
  { title: "Upload document", value: NewDocumentStep.upload },
  { title: "Results", value: NewDocumentStep.results }
];

type NewDocumentStepperProps = {
  current: NewDocumentStep;
};

/** Where the user is in the wizard. It only shows the steps: moving between them happens through links. */
export function NewDocumentStepper({ current }: NewDocumentStepperProps) {
  const currentIndex = STEPS.findIndex((step) => step.value === current);

  return (
    <Stepper aria-label="Steps" nonInteractive value={current}>
      {/* The design system lays a horizontal nav out as a row at every width; below `sm` it is stacked instead. */}
      <StepperNav className="items-start gap-3 data-[orientation=horizontal]:flex-col sm:items-center sm:gap-6 sm:data-[orientation=horizontal]:flex-row">
        {STEPS.map((step, index) => (
          <StepperItem completed={index < currentIndex} key={step.value} value={step.value}>
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
