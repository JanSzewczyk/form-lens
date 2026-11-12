# Releases

Each app is versioned and released on its own by [release-please](https://github.com/googleapis/release-please),
from the Conventional Commits on `main` (`feat` bumps the minor version, `fix` and `perf` the patch version, `!` or a
`BREAKING CHANGE:` footer the major version; while an app is `0.x`, a breaking change bumps the minor).

| App | Version file | Tag | Changelog |
| --- | --- | --- | --- |
| `apps/api` | `pyproject.toml` | `api-vX.Y.Z` | `apps/api/CHANGELOG.md` |
| `apps/studio` | `package.json` | `studio-vX.Y.Z` | `apps/studio/CHANGELOG.md` |

`.github/workflows/release.yml` keeps one release pull request open. Merge it with squash to tag the apps and create the
GitHub Releases. The workflow also refreshes `apps/api/uv.lock` and `package-lock.json` on the pull request branch,
because release-please does not touch them and `uv sync --locked` would fail otherwise.

## One-time setup

A pull request or a push made with the default `GITHUB_TOKEN` does not start CI, so the required checks would wait
forever on the release pull request. The workflow uses a GitHub App instead:

1. Create a GitHub App (Settings → Developer settings → GitHub Apps) with the repository permissions *Contents:
   Read and write* and *Pull requests: Read and write*, and install it on this repository.
2. Add the repository secrets `RELEASE_APP_ID` (the App ID) and `RELEASE_APP_PRIVATE_KEY` (a generated private key).

Until both exist the workflow succeeds and only prints a notice.

## The first release

`apps/api` is already at `0.1.0` (the tag `api-v0.1.0` came with the history). `apps/studio` starts at `0.1.0` with no
tag; `bootstrap-sha` in `release-please-config.json` keeps the pull request from listing the whole history. Check the
first release pull request: its CI must pass (the lock files are refreshed by the workflow), and `apps/studio` must
get its changelog.
