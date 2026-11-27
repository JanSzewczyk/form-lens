import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { z } from "zod";

/**
 * The Studio's upload limit, in MB. The request body limit is fixed when the app is built: raising
 * `FORMLENS_MAX_UPLOAD_MB` needs a rebuild with the value set at build time; at runtime it can only lower the limit.
 */
const DEFAULT_MAX_UPLOAD_MB = 25;

/**
 * Parsed like `FORMLENS_MAX_UPLOAD_MB` in `data/env/server.ts` (an empty value counts as unset). Importing that module
 * would validate the whole env here, and with `SKIP_ENV_VALIDATION` it returns the raw string. A value the schema
 * refuses falls back to the default here; the env validation still refuses it when the app starts.
 */
function maxUploadMb(): number {
  const parsed = z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_MAX_UPLOAD_MB)
    .safeParse(process.env.FORMLENS_MAX_UPLOAD_MB || undefined);
  return parsed.success ? parsed.data : DEFAULT_MAX_UPLOAD_MB;
}

/** The limit this build accepts; `data/env/server.ts` caps the runtime value at it. */
const BUILD_MAX_UPLOAD_MB = maxUploadMb();

/** The upload arrives as multipart form data; 1 MB on top of the file covers the boundaries and the other fields. */
const REQUEST_BODY_LIMIT = `${BUILD_MAX_UPLOAD_MB + 1}mb` as const;

export default {
  /** Inlined where the code reads `process.env.FORMLENS_BUILD_MAX_UPLOAD_MB`, so the runtime limit can be capped at it. */
  env: {
    FORMLENS_BUILD_MAX_UPLOAD_MB: String(BUILD_MAX_UPLOAD_MB)
  },
  experimental: {
    optimizePackageImports: ["@szum-tech/design-system"],
    proxyClientMaxBodySize: REQUEST_BODY_LIMIT,
    serverActions: {
      bodySizeLimit: REQUEST_BODY_LIMIT
    }
  },
  logging: {
    browserToTerminal: true
  },
  output: "standalone",
  // The Docker image copies only what the server traces; in a monorepo the trace starts at the repo root.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  productionBrowserSourceMaps: true,
  reactCompiler: true,
  reactStrictMode: true,
  async rewrites() {
    return [
      { destination: "/api/health", source: "/healthz" },
      { destination: "/api/health", source: "/api/healthz" },
      { destination: "/api/health", source: "/health" },
      { destination: "/api/health", source: "/ping" }
    ];
  },
  // The client package is TypeScript source, built by this app.
  transpilePackages: ["@form-lens/api-client"]
} satisfies NextConfig;
