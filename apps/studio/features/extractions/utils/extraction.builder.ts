import { type ExtractionResponse, ExtractionStatus } from "@form-lens/api-client";
import { build, type Overrides, sequence } from "mimicry-js";

type BuildConfig<T> = { overrides?: Overrides<T> };

/** The part of a mimicry-js builder the tests use; see `template.builder.ts` for why it is typed by hand. */
type Builder<T> = {
  one(config?: BuildConfig<T>): T;
};

/** An extraction as the API returns it right after a submit: queued, with no result yet. */
export const extractionResponseBuilder: Builder<ExtractionResponse> = build<ExtractionResponse>({
  fields: {
    attempts: 0,
    created_at: "2026-11-26T08:00:00Z",
    error: null,
    fields: () => [],
    filename: "invoice_118_2026.pdf",
    finished_at: null,
    id: sequence((counter) => `10000000-0000-4000-8000-${String(counter).padStart(12, "0")}`),
    missing_required: () => [],
    result: null,
    started_at: null,
    status: ExtractionStatus.pending,
    template_id: "00000000-0000-4000-8000-000000000001",
    template_name: "VAT invoice",
    template_version: 1
  }
});
