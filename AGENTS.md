# AGENTS.md

Guidance for code agents working on this repository.

## Project Overview
- Dual-mode REST API that builds `.comapeocat` archives.
- **/v1 (legacy)**: accepts ZIP, shells out to `mapeo-settings-builder` CLI.
- **/v2 (new)**: accepts JSON, uses `comapeocat@1.1.0` Writer with strict validation and type mapping.
- Runtime: Bun 1.3.2 locally (Docker image installs Bun 1.0.16).
- Framework: Elysia.
- Key deps: `comapeocat@1.1.0`, `mapeo-settings-builder@^6` (global in Docker).

## Common Commands
```bash
bun install
bun run dev
bun run start
bun run build
bun run lint
bun test           # all tests
bun run test:unit
bun run test:integration

# Smoke both routes (downloads v5.0.0 config for v1)
./scripts/test-api.sh
./scripts/test-api.sh --url http://localhost:3000 --file path/to/zip
```

## Architecture (updated)
- `src/app.ts` – Elysia app with routes `/v1`, `/v2`, `/`→`/v1`; CORS + logger + errorHandler.
- `src/controllers/settingsController.ts` – dispatch to v1/v2 builders.
- Services:
  - `settingsBuilder.ts` (v1): unzip, find `metadata.json` recursively; defaults filename to `config-v1` if missing; runs `mapeo-settings-builder` via `runShellCommand`, polls for output.
  - `comapeocatBuilder.ts` (v2): validates payload (size caps, entry caps, BCP-47), maps legacy field types, derives category selection, fetches SVG URLs with timeout/size checks, builds via `Writer` to temp file with provenance (`builderName comapeocat`, `builderVersion 1.1.0`).
- Config: `src/config/app.ts` includes byte limits, icon fetch timeout, temp prefixes.
- Middleware: `logger.ts`, `errorHandler.ts`.
- Tests: unit and integration under `src/tests`; route integration (`routes.test.ts`).

## Docker Notes
- Base image `node:18-bullseye-slim`; installs Bun 1.0.16 and `mapeo-settings-builder` globally.
- `/v1` may require mapnik; `/v2` works without it. Docker smoke script tolerates v1 failures but requires v2 to pass.
- Exposes port 3000; entrypoint `bun run index.ts`.

## Testing Strategy
- Unit: builders, middleware, config, helpers.
- Integration: `/v1` and `/v2` routes.
- Scripted smoke: `scripts/test-api.sh` (falls back to integration tests if no server), `scripts/test-docker.sh` (CI-friendly, continues if v1 fails, validates v2).

## Important Notes
- For v1 inputs missing `metadata.name/version`, filename defaults to `config-v1.comapeocat`.
- v2 enforces: JSON ≤1MB, SVG ≤2MB, total entries ≤10k, BCP‑47 locales, appliesTo/tags required (tags default to `{categoryId: <id>}`), category selection must include track if any `track: true` present.
- Field mappings (v2): select→selectOne, multiselect→selectMultiple, textarea→text, integer→number, boolean→selectOne(Yes/No), date/datetime/photo/location→text.
