---
name: release-publish
description: Publish a new nano-codin version. Use when the user asks to release, publish, cut, or ship a version such as v0.1.5. This skill follows the repo's exact release flow:update CHANGELOG, align package.json/package-lock.json to the target version, verify locally, then push a release/vX.Y.Z branch so GitHub Actions publishes to npm.
---

# Release Publish

Use this skill for repo releases like `发布 v0.1.5`, `publish 0.1.5`, or `cut a patch release`.

## Workflow

1. Inspect the current state before changing anything.
   - Check `git status --short --branch`.
   - Read `package.json`, `CHANGELOG.md`, and `.github/workflows/release.yml`.
   - Confirm the current version and whether `release/vX.Y.Z` already exists.

2. Prepare release metadata locally.
   - Move the relevant `## [Unreleased]` notes into a dated `## [X.Y.Z] - YYYY-MM-DD` section in `CHANGELOG.md`.
   - Set `package.json` and `package-lock.json` to the target version.
   - Prefer `npm version X.Y.Z --no-git-tag-version` so repo hooks run consistently.

3. Verify before pushing.
   - Run `npm run typecheck`.
   - Run `npm run build`.
   - Run `npm run test` when the change is standard-sized or larger.
   - If `npm version ...` ran `preversion`, that already covers `typecheck + build + npm pack --dry-run`; still check the output and report it.

4. Create clean release commits.
   - Do not include unrelated local noise such as `.omx/metrics.json`.
   - Commit release notes and version metadata with Lore-style trailers when making a commit.
   - Keep the branch contents consistent with the target version before the final push.

5. Push the release branch.
   - Create or update `release/vX.Y.Z`.
   - Push `git push -u origin release/vX.Y.Z`.
   - This repo's GitHub Actions workflow on `release/**` handles the publish.

## Repo-Specific Rules

- The automated workflow lives at `.github/workflows/release.yml`.
- Exact-version releases should use `release/vX.Y.Z`, not `release/patch` / `release/minor` / `release/major`, unless the user explicitly wants a bump-by-type flow.
- The branch should already contain the target version in `package.json` and `package-lock.json`.
- Do not assume GitHub Actions has rewritten the version later; verify the branch contents yourself.
- Preserve unrelated working tree changes.

## Final Report

Report:
- target version
- files changed
- local verification run
- release branch pushed or blocked
- any remaining risk, especially whether GitHub Actions / npm publish still needs confirmation
