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
  badRequest: "Interfejs API nie przyjął formularza.",
  invalid: "Interfejs API odrzucił formularz. Popraw zaznaczone pola.",
  invalidInput: "Formularz zawiera błędy. Popraw zaznaczone pola.",
  invalidTemplate: "Interfejs API odrzucił formularz",
  notFound: "Ten formularz już nie istnieje. Mógł zostać usunięty w innym miejscu.",
  tooLarge: "Formularz jest zbyt duży, aby go zapisać.",
  unavailable: "Interfejs API jest niedostępny. Wpisane dane zostały zachowane, spróbuj ponownie za chwilę."
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
  return path
    .map((part, index) =>
      index === 2 && typeof part === "string" ? (FORM_PROPERTY_OF_API_PROPERTY[part] ?? part) : part
    )
    .join(".");
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
    for (const issue of problem.errors) {
      const path = formPathOf(issue.loc);
      if (path !== undefined) {
        fieldErrors[path] ??= issue.msg;
      }
    }
    return failure(TemplateActionFailureKind.validation, MESSAGE.invalid, fieldErrors);
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
