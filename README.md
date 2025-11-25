# Comapeo Config Builder API

Dual-mode REST API for producing CoMapeo configuration archives (`.comapeocat`).

- `/v1` (legacy): accepts a ZIP upload and shells out to `mapeo-settings-builder` (root `/` aliases to `/v1`).
- `/v2` (modern): accepts JSON and uses `comapeocat@1.1.0` Writer with strict validation and provenance metadata.

## Features
- Bun-native (Elysia) server with TypeScript support.
- Provenance in archives (`builderName: "comapeocat"`, `builderVersion: 1.1.0`).
- Defense-in-depth validation: streaming body size enforcement, icon download limits, BCP‑47 locale checks, entry caps.
- Legacy-friendly type mapping (`boolean` → `selectOne` Yes/No, etc.).
- Scripted smoke tests for both endpoints (`scripts/test-api.sh`, Docker smoke in CI).

## Requirements
- Bun ≥ 1.3.2 (1.0.16 inside the Docker image).
- Node.js toolchain available for Docker builds.
- Global dependency for v1: `npm install -g mapeo-settings-builder` (not needed if you only use v2).

## Installation

### Local (Bun)
```bash
bun install           # installs comapeocat@1.1.0 and all deps
npm install -g mapeo-settings-builder   # only if you need /v1
```

### Prebuilt Docker image (recommended)
```bash
docker pull communityfirst/comapeo-config-builder-api:latest
docker run -p 3000:3000 communityfirst/comapeo-config-builder-api:latest
```

### Build your own image
```bash
docker build -t comapeo-config-builder-api:local .
docker run -p 3000:3000 comapeo-config-builder-api:local
```

## Running
```bash
# Dev with hot reload
bun run dev

# Production
bun run start
```

## Testing & Quality
```bash
bun test                          # all tests
bun test src/tests/unit/utils/shell.test.ts   # single file
./scripts/test-api.sh             # hits both endpoints (requires server running)
bun run lint                      # Biome lint
bun tsc --noEmit                  # TypeScript type-check
```

## API

### Health
```
GET /health
```

### v1 (ZIP → mapeo-settings-builder)
```
POST /v1
POST /            # alias to /v1
Content-Type: multipart/form-data
field: file=@config.zip
```
Example:
```bash
curl -X POST -F "file=@config.zip" -o out.comapeocat http://localhost:3000/v1
```

### v2 (JSON → comapeocat Writer)
```
POST /v2
Content-Type: application/json
```
Example payload:
```json
{
  "metadata": { "name": "demo", "version": "1.0.0" },
  "categories": [
    {
      "id": "cat-1",
      "name": "Trees",
      "appliesTo": ["observation", "track"],
      "fields": ["field-1"],
      "tags": { "categoryId": "cat-1" },
      "track": true
    }
  ],
  "fields": [
    { "id": "field-1", "name": "Species", "tagKey": "species", "type": "select", "options": [{ "label": "Oak", "value": "oak" }] }
  ],
  "icons": [{ "id": "tree", "svgUrl": "https://example.com/tree.svg" }],
  "translations": { "en": { "labels": { "cat-1": "Trees" } } }
}
```

#### Field/type mapping (v2)
- `select` → `selectOne`
- `multiselect` → `selectMultiple`
- `textarea` → `text`
- `integer` → `number`
- `boolean` → `selectOne` with Yes/No options
- `date`/`datetime`/`photo`/`location` → `text`
- Unsupported types → 400

#### Category selection (v2)
- All categories appear in the observation list (order preserved).
- Categories with `track: true` are added to the track list (must not be empty if any track is declared).

#### Limits & validation (v2)
- JSON body ≤ 1 MB (enforced while streaming parse).
- SVG icons ≤ 2 MB each; remote fetch timeout 5s; content-type check.
- Total entries (categories + fields + icons + options + translations) ≤ 10,000.
- Categories must include `appliesTo`; `tags` default to `{ categoryId: <id> }` when missing/empty.
- Locales must be valid BCP‑47 (normalized via `Intl.getCanonicalLocales`).
- Metadata `name`/`version` cannot contain path separators (path traversal guard).

## Project Structure
- `src/index.ts` — entrypoint (reads `package.json` version, starts server).
- `src/app.ts` — Elysia app factory, routes `/health`, `/`, `/v1`, `/v2`, streaming JSON parser/limits.
- `src/controllers/` — request dispatchers.
- `src/services/` — `settingsBuilder` (v1) and `comapeocatBuilder` (v2) implementations.
- `src/middleware/` — logger, error handler.
- `src/config/app.ts` — size/time limits and temp prefixes.
- `scripts/` — API and Docker smoke tests.

## CI/CD
- `docker-test.yml`: lint + unit/integration on Bun 1.3.2, v2 API smoke, Docker smoke; PRs also publish a GHCR preview image `ghcr.io/<repo>:pr-<number>`.
- `deploy.yml`: on `main`, run tests/lint/tsc then build & push `communityfirst/comapeo-config-builder-api:latest` to Docker Hub and sync its description.

## License
MIT
