import "server-only";

import type { ProblemDetail } from "@form-lens/api-client";
import type { ZodError } from "zod";

import {
  type TemplateActionFailure,
  TemplateActionFailureKind,
  templateActionFailureSchema
} from "~/features/templates/schemas/template-action-result";

/** The API names a field `name` and `allowed_values`; the form calls them `key` and `allowedValues`. */
const FORM_PROPERTY_OF_API_PROPERTY: Record<string, string> = {
  allowed_values: "allowedValues",
  description: "description",
  maximum: "maximum",
  minimum: "minimum",
  name: "key",
  pattern: "pattern",
  required: "required",
  type: "type"
};

const MESSAGE = {
  badRequest: "The API did not accept the form.",
  invalid: "The API rejected the form. Fix the marked fields.",
  invalidInput: "The form has errors. Fix the marked fields.",
  invalidTemplate: "The API rejected the form",
  notFound: "This form no longer exists. It may have been deleted elsewhere.",
  tooLarge: "The form is too large to save.",
  unavailable: "The API is unavailable. Your input was kept, try again in a moment."
} as const;

function failure(
  kind: TemplateActionFailureKind,
  error: string,
  fieldErrors: Record<string, string> = {}
): TemplateActionFailure {
  return templateActionFailureSchema.parse({ error, fieldErrors, kind, success: false });
}

/** A form path such as `fields.0.key` for a `loc` of the API's validation issues, or `undefined` when it is not a form input. */
function formPathOf(loc: ReadonlyArray<string | number>): string | undefined {
  const [source, ...path] = loc;
  if (source !== "body" || path.length === 0) {
    return undefined;
  }
  const [list, index, property] = path;
  if (list !== "fields" || index === undefined || property === undefined) {
    return path.join(".");
  }
  // Anything deeper than the property (the position of one allowed value) is shown on the property's own input.
  return `fields.${index}.${FORM_PROPERTY_OF_API_PROPERTY[String(property)] ?? property}`;
}

function withDetail(message: string, detail: string | null | undefined): string {
  return detail ? `${message}: ${detail}` : message;
}

/** The user's view of an answer the API refused. The raw problem is logged by the caller. */
export function mapProblem(status: number, problem: ProblemDetail | undefined): TemplateActionFailure {
  if (status === 404) {
    return failure(TemplateActionFailureKind.notFound, MESSAGE.notFound);
  }
  if (status === 413) {
    return failure(TemplateActionFailureKind.validation, MESSAGE.tooLarge);
  }
  if (status === 422 && problem?.errors?.length) {
    const fieldErrors: Record<string, string> = {};
    const ofTheBody: Array<string> = [];
    for (const issue of problem.errors) {
      const path = formPathOf(issue.loc);
      if (path !== undefined) {
        fieldErrors[path] ??= issue.msg;
      } else if (issue.loc[0] === "body") {
        ofTheBody.push(issue.msg);
      }
    }
    // A problem of the body as a whole has no input to sit next to, so its message goes into the form-level text.
    const error =
      ofTheBody.length === 0
        ? MESSAGE.invalid
        : withDetail(
            Object.keys(fieldErrors).length === 0 ? MESSAGE.invalidTemplate : MESSAGE.invalid,
            ofTheBody.join("; ")
          );
    return failure(TemplateActionFailureKind.validation, error, fieldErrors);
  }
  if (status === 422) {
    return failure(TemplateActionFailureKind.validation, withDetail(MESSAGE.invalidTemplate, problem?.detail));
  }
  if (status === 400) {
    return failure(TemplateActionFailureKind.validation, withDetail(MESSAGE.badRequest, problem?.detail));
  }
  return failure(TemplateActionFailureKind.unavailable, MESSAGE.unavailable);
}

/** The API did not answer at all (network error or timeout). */
export function mapUnreachable(): TemplateActionFailure {
  return failure(TemplateActionFailureKind.unavailable, MESSAGE.unavailable);
}

/** The server-side check of the input failed; this only happens to a request that did not come from the form. */
export function mapInvalidInput(error: ZodError): TemplateActionFailure {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    fieldErrors[issue.path.join(".")] ??= issue.message;
  }
  return failure(TemplateActionFailureKind.validation, MESSAGE.invalidInput, fieldErrors);
}
