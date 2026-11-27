import type { ExtractionView } from "~/features/extractions/schemas/extraction";

export const ResultRowState = {
  found: "found",
  missingRequired: "missing-required",
  notFound: "not-found"
} as const;

export type ResultRowState = (typeof ResultRowState)[keyof typeof ResultRowState];

export type ResultRow = {
  name: string;
  state: ResultRowState;
  /** The value as text; `null` when the document does not show one. */
  value: string | null;
};

type ResultSource = Pick<ExtractionView, "fields" | "missing_required" | "result">;

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * One row per field of the form as it was at the submit, in its order. A field the result has no value for is "Not
 * found", or "Missing required" when the API lists it in `missing_required`; keys of the result that the submitted form
 * did not have are left out.
 */
export function getResultRows({ fields, missing_required, result }: ResultSource): Array<ResultRow> {
  const missing = new Set(missing_required ?? []);

  return fields.map((field) => {
    const value = result?.[field.name];
    if (value === null || value === undefined) {
      return {
        name: field.name,
        state: missing.has(field.name) ? ResultRowState.missingRequired : ResultRowState.notFound,
        value: null
      };
    }
    return { name: field.name, state: ResultRowState.found, value: toText(value) };
  });
}

/** "1 required field was not found", plural from two; `null` when every required field was found. */
export function describeMissingRequired(rows: ReadonlyArray<ResultRow>): string | null {
  const count = rows.filter((row) => row.state === ResultRowState.missingRequired).length;
  if (count === 0) {
    return null;
  }
  return count === 1 ? "1 required field was not found" : `${count} required fields were not found`;
}
