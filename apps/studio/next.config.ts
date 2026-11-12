import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

export default {
  experimental: {
    optimizePackageImports: ["@szum-tech/design-system"]
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
