import { defineConfig } from "orval";

// ORVAL_OUT lets `generate:check` write to a temporary folder and compare it with the committed one.
const out = process.env.ORVAL_OUT ?? "src/generated";

export default defineConfig({
  formlens: {
    input: { target: "../../apps/api/openapi.json" },
    output: {
      client: "fetch",
      clean: true,
      mode: "tags-split",
      override: {
        fetch: { includeHttpResponseReturnType: true },
        mutator: { name: "customFetch", path: "./src/fetcher.ts" }
      },
      schemas: `${out}/model`,
      target: out
    }
  }
});
