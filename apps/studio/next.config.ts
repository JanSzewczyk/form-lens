import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/** The Studio's upload limit, in MB. Read here when the config loads, so a change needs a restart. */
const DEFAULT_MAX_UPLOAD_MB = 25;

function maxUploadMb(): number {
  const parsed = Number.parseInt(process.env.FORMLENS_MAX_UPLOAD_MB ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_MB;
}

/** The upload arrives as multipart form data; 1 MB on top of the file covers the boundaries and the other fields. */
const REQUEST_BODY_LIMIT = `${maxUploadMb() + 1}mb` as const;

export default {
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
