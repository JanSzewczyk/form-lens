import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: process.env,
  server: {
    ANALYZE: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
    CI: z
      .enum(["true", "false", "0", "1"])
      .optional()
      .transform((value) => value === "true" || value === "1"),
    /** Where the FormLens API listens (apps/api). */
    FORMLENS_API_URL: z.url().default("http://localhost:8000"),
    /**
     * Largest document the Studio accepts for upload, in megabytes. The request body limit is fixed when the app is
     * built (`next.config.ts`), so raising it needs a rebuild with the value set at build time; at runtime it can only
     * lower the limit. Read the limit through `maxUploadMb`, never from here.
     */
    FORMLENS_MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional().default("info"),
    NODE_ENV: z.enum(["development", "test", "production"]),
    VERCEL_URL: z.string().optional()
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION
});

const DEFAULT_MAX_UPLOAD_MB = 25;

const uploadLimitSchema = z.coerce.number().int().positive();

/**
 * The upload limit in MB: the runtime value, capped at the request body limit the app was built with. Each side may be a
 * number, a string (when env validation is skipped) or missing; a missing or invalid side counts as the default 25 MB.
 */
export function capUploadLimitMb(runtime: unknown, build: unknown): number {
  const runtimeMb = uploadLimitSchema.safeParse(runtime === "" ? undefined : runtime);
  const buildMb = uploadLimitSchema.safeParse(build === "" ? undefined : build);
  return Math.min(
    runtimeMb.success ? runtimeMb.data : DEFAULT_MAX_UPLOAD_MB,
    buildMb.success ? buildMb.data : DEFAULT_MAX_UPLOAD_MB
  );
}

/**
 * The upload limit every consumer uses (the UI hint and the action's file check). `next.config.ts` inlines
 * `FORMLENS_BUILD_MAX_UPLOAD_MB` at build time, and only where the code spells `process.env.FORMLENS_BUILD_MAX_UPLOAD_MB`
 * out; `createEnv` reads `process.env` dynamically and would not see it.
 */
export const maxUploadMb = capUploadLimitMb(env.FORMLENS_MAX_UPLOAD_MB, process.env.FORMLENS_BUILD_MAX_UPLOAD_MB);
