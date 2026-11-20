import type { TemplateResponse } from "@form-lens/api-client";

export const TemplatesStatus = {
  ok: "ok",
  unavailable: "unavailable"
} as const;

export type TemplatesStatus = (typeof TemplatesStatus)[keyof typeof TemplatesStatus];

/** An unavailable result carries no text of the API: the list shows its own fixed message. */
export type TemplatesResult =
  | { status: typeof TemplatesStatus.ok; templates: Array<TemplateResponse>; total: number; pageSize: number }
  | { status: typeof TemplatesStatus.unavailable };
