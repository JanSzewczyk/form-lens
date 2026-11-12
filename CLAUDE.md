# form-lens

Nx monorepo of FormLens: `apps/api` (FastAPI, Python, uv), `apps/studio` (Next.js, npm) and `packages/api-client`
(generated TypeScript client). Each app has its own `CLAUDE.md`; read it before working in that folder.

## Rules

- Run an app's own commands from its folder: `make ...` and `uv ...` in `apps/api`, `npm run ... -w @form-lens/studio`
  (or inside `apps/studio`) for the Studio. `npx nx run api:check` is `make check` from the root.
- The Python package, CLI and image stay `formlens`; the repository, the Nx projects and the Studio use `form-lens`.
  Nx project names: `api`, `@form-lens/studio`, `@form-lens/api-client`.
- One `package-lock.json` at the root (npm workspaces: `apps/studio`, `packages/api-client`); `apps/api` is a
  standalone uv project with its own `uv.lock`. Add npm dependencies with `npm install <pkg> -w <workspace>`.
- `packages/api-client/src/generated` is generated; never edit it. After an API contract change run
  `make openapi` in `apps/api`, then `npm run generate -w @form-lens/api-client`; CI runs `generate:check`.
  Import the client in the Studio only through `apps/studio/lib/formlens-api.ts`, from server code.
- Commit messages follow Conventional Commits (`type(scope): imperative summary`); the scope is `api`, `studio` or
  `api-client` for a change in one app. release-please builds the versions and changelogs from them.
- Branch protection requires `Check ✅` and `Audit 🔒` by name. Renaming a job leaves pull requests waiting for a
  status that never arrives. `Check ✅` is the gate over all other jobs; a job skipped because its app is not
  affected counts as passed.
- The uv version is pinned in `apps/api/Dockerfile` and in `UV_VERSION` of each workflow that sets it
  (`apps/api/tests/test_tooling.py` checks they match).
- The templates the apps started from, and their commits, are in `docs/templates.md`. `template-sync` does not work
  here; compare by hand.
- `.claude/rules/studio-*.md` apply to `apps/studio` only (a `paths` filter).
