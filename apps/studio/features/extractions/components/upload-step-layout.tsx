import type { TemplateResponse } from "@form-lens/api-client";

import type { SubmitFailure } from "~/features/extractions/schemas/extraction";

import { FieldsToFindCard } from "./fields-to-find-card";
import { SelectedFormItem } from "./selected-form-item";
import { UploadForm } from "./upload-form";

type UploadStepLayoutProps = {
  template: TemplateResponse;
  /** The Studio's upload limit in MB, from the server env. */
  maxMb: number;
  /** `submitExtraction` bound to the selected template: it redirects on success and returns a failure otherwise. */
  onSubmitAction(previous: SubmitFailure | null, formData: FormData): Promise<SubmitFailure>;
};

/**
 * The Upload step: the selected form and the drop zone next to the Fields to find card. The columns wrap, so on a phone
 * the card stacks under the drop zone.
 */
export function UploadStepLayout({ template, maxMb, onSubmitAction }: UploadStepLayoutProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
        <SelectedFormItem template={template} />
        <UploadForm maxMb={maxMb} onSubmitAction={onSubmitAction} />
      </div>
      <div className="min-w-0 flex-[1_1_300px]">
        <FieldsToFindCard template={template} />
      </div>
    </div>
  );
}
