# AGENTS

- Use concise, concrete steps; prefer small, reviewable diffs.
- Follow existing TypeScript + ESM patterns; avoid introducing new tooling.
- Keep public CLI behavior and output stable unless the task explicitly changes it.
- Prefer editing sources in `src/` and let `npm run build` generate `dist/`.
- When changing prompts, update files in `src/prompts/` and ensure `scripts/copy-prompts.mjs` stays consistent.
- Tests: `npm run test` for unit/integration, `npm run typecheck` for TS, `npm run build` for full build.
- If touching config loading or agent behavior, add/adjust tests under `tests/`.
- Avoid broad file scans; use targeted searches (e.g., `rg`) and mention key files you touched.
- Keep AGENTS guidelines short and practical (this file is parsed line-by-line).
