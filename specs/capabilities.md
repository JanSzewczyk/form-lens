# Project Capabilities

<!-- sdd-format: 2 -->

> The `<!-- auto-generated -->` section is rewritten by `/sdd:doctor init`; `<!-- user-override -->`
> sections are never overwritten.

## Projects

<!-- auto-generated -->
<!-- `- **<name>** — <kind> · <path> · <stack>`; `(repo)` after the path of a sibling repository.
     Single-app repo: one project, `root` (`.`). -->
- **api** — backend · apps/api · Python, FastAPI (uv)
- **@form-lens/studio** — web · apps/studio · TypeScript, Next.js 16, React 19, Vitest, Storybook (npm)
- **@form-lens/api-client** — library · packages/api-client · TypeScript, Orval-generated client (npm)

## Implementation

<!-- user-override -->
<!-- Who implements a task when `/sdd:implement` hands it over. One line per project, `default` for
     the rest. Values: `skill:<name>` | `agent:<name>` | `command:<shell>` (brief on stdin) |
     `in-session` (the session itself). Example: `api: agent:python-developer`. -->
default: in-session
api: agent:python:python-developer
@form-lens/studio: in-session
commit: task
isolation: none
merge: pr
parallel: 3

## Actions

<!-- user-override -->
<!-- Who performs a git action. `skill:<name>` | `agent:<name>` | `command:<shell>`. Unset → the
     session creates the branch / commit / PR itself with git and gh (or with a matching skill it has). -->
branch: skill:git-workflow:create-branch
commit: skill:git-workflow:create-commit
pr: skill:git-workflow:create-pull-request

## Review

<!-- user-override -->
<!-- How `/sdd:review` verifies. `tests`: run | skip. `publish`: ask | off (commit
     + PR after READY). Audit flow: `default` and per-project lines, `auto` (skills the session has,
     by stack) | `skill:<name>` | `agent:<name>`. `checks`: extra agents/skills run on every review,
     e.g. a QA agent that starts the app and tests the functionality — `agent:qa`. -->
tests: run
publish: ask
default: auto
api: agent:python:python-reviewer
@form-lens/studio: agent:nextjs:code-reviewer
checks:
ci: on

## Generated / out-of-band paths

<!-- user-override -->
<!-- Globs of generated / non-hand-authored files. spec-verifier, reviewer and
     /sdd:analyze exclude them from every diff and never flag them. -->
- `**/*.generated.*`
- `**/generated/**`
- `**/__snapshots__/**`
- `**/*.snap`
- `**/pnpm-lock.yaml`
- `**/package-lock.json`
- `**/yarn.lock`
- `**/uv.lock`
- `**/poetry.lock`
- `**/pubspec.lock`
- `**/Podfile.lock`
