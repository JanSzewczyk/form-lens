import { z } from "zod";

/**
 * The Studio's upload limit, in MB, when `FORMLENS_MAX_UPLOAD_MB` is not set. The only place it is declared:
 * `next.config.ts` imports it too, so this module must stay free of side effects (no env, no logger).
 */
export const DEFAULT_MAX_UPLOAD_MB = 25;

const uploadLimitSchema = z.coerce.number().int().positive();

/**
 * An upload limit in MB read from an env value: a number, a string (when env validation is skipped or before it runs)
 * or nothing. A missing, empty or invalid value counts as the default.
 */
export function parseUploadLimitMb(value: unknown): number {
  const parsed = uploadLimitSchema.safeParse(value === "" ? undefined : value);
  return parsed.success ? parsed.data : DEFAULT_MAX_UPLOAD_MB;
}
