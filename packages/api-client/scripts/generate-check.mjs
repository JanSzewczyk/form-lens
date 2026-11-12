// Fails when src/generated is not what Orval makes of apps/api/openapi.json, like `make openapi-check`.
// The check output goes to a folder at the same depth as src/generated, so the relative imports match.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const committed = "src/generated";
const fresh = "src/.generated-check";

function files(root, dir = "") {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? files(root, path) : [path];
  });
}

rmSync(fresh, { force: true, recursive: true });
const run = spawnSync("npx", ["orval"], { env: { ...process.env, ORVAL_OUT: fresh }, stdio: "inherit" });
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const before = new Set(files(committed));
const after = new Set(files(fresh));
const drift = [...new Set([...before, ...after])].filter(
  (file) =>
    !before.has(file) ||
    !after.has(file) ||
    readFileSync(join(committed, file), "utf8") !== readFileSync(join(fresh, file), "utf8")
);
rmSync(fresh, { force: true, recursive: true });

if (drift.length > 0) {
  console.error(`The generated client is out of date (${drift.join(", ")}). Run \`npm run generate -w @form-lens/api-client\`.`);
  process.exit(1);
}
console.log("The generated client matches apps/api/openapi.json.");
