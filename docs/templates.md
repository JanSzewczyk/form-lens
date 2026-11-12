# Templates this repository started from

`template-sync` cannot follow a template inside a monorepo, so the starting points are recorded here. Catch up with a
template by comparing its changes since the commit below with the folder named next to it.

| Folder | Template | Last synced commit |
| --- | --- | --- |
| `apps/api` | [fastapi-szumplate](https://github.com/JanSzewczyk/fastapi-szumplate) | `40cc334` (the last `chore: sync with template` commit in the API history) |
| `apps/studio` | [nextjs-szumplate](https://github.com/JanSzewczyk/nextjs-szumplate) | `e172386` |

What was changed on the way into `apps/studio`: npm workspace instead of a single package (one `package-lock.json` at
the root), `semantic-release`, `release.config.js`, `SECURITY.md` and the template's `.github/` removed (releases and
CI are at the root), the Claude rules moved to the root `.claude/rules/` with a `paths` filter, `output: "standalone"`
with the output tracing root at the repository root, and a Dockerfile built from the repository root.
