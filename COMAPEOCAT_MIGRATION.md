# COMAPEOCAT dual‑mode migration plan
Date: 2025-11-24
Repository: comapeo-config-builder-api (Bun 1.3.2, Elysia ^1.2.25)

## 1) Purpose & success criteria
- Keep `/v1` behavior unchanged: accepts ZIP, shells out to `mapeo-settings-builder` to build `.comapeocat`.
- Add `/v2` powered by `comapeocat` Writer API with equivalent output shape for compliant inputs.
- Both routes run in parallel behind explicit versioned paths (no silent behavior change).
- Green tests and scripts for both paths; docs (README/OpenAPI) describe versioning.

## 2) Version pins & assumptions
- comapeocat: v1.1.0 (commit `e1e0e470664dc5ba69b8ab61794633e8a2b2467a`).
- Bun runtime: 1.3.2 (local toolchain).
- Elysia: ^1.2.25.
- Legacy builder: `mapeo-settings-builder` ^6.0.0 (kept for `/v1`).
- Output format: `.comapeocat` spec 1.0 (required files: VERSION, categories.json, categorySelection.json, metadata.json; optional fields.json, icons/, translations/).

## 3) comapeocat capabilities (Writer API highlights)
- Entry points: `new Writer()`, `addCategory(id, category)`, `addField(id, field)`, `addIcon(id, svg)`, `addTranslations(lang, translations)`, `setCategorySelection(obj)`, `setMetadata(metadata)`, `finish()`, `outputStream` (readable zip).
- Required schema shape:
  - Metadata: name (req), version (opt), builderName/builderVersion (opt). buildDateValue set on finish.
  - Categories: name (req), appliesTo (req; observation|track array), tags (req Record<string, string|number|boolean|null>), fields (req string[]), icon (opt), addTags/removeTags (opt), terms (opt), color (opt hex).
  - Fields: type ∈ {text, number, selectOne, selectMultiple}; tagKey (req); label (req); placeholder/helperText/appearance (opt); select* requires options[{label,value}].
  - Category selection: object with observation and track arrays (each non-empty; ids must include appliesTo docType).
  - Icons: inline SVG string only; validated and sanitized.
  - Translations: per-language JSON; lang must be valid BCP-47; propertyRefs may target nested/option paths.
- Constraints: max icon size 2 MB; max JSON file size 1 MB; max entries 10k; validation via valibot + reference checks; SVG parsed/sanitized; BCP-47 normalized.
- Output expectations: ZIP with VERSION file value `1.0`; streaming-friendly via `outputStream`.

## 4) Current state summary (/v1)
- Routing: single `POST /` in `src/app.ts` → `handleBuildSettings` → `buildSettings`.
- Build flow (`src/services/settingsBuilder.ts`): unzip upload to tmp (`comapeo-settings-*`), read metadata.json for name/version, call `mapeo-settings-builder build <dir> -o build/<name>-<version>.comapeocat`, poll filesystem for output.
- Validation: none in API layer (relies on CLI); errors surfaced only if file missing after polling.
- Builders: only ZIP builder (no JSON/stream builder); CLI handles schema/refs.
- Tooling/scripts: Dockerfile installs global `mapeo-settings-builder`; `scripts/test-api.sh` and `scripts/test-docker.sh` hit root endpoint and assert returned file is a ZIP; tests do not cover schema validation or translations.

## 5) Mapping: current inputs → comapeocat Writer

| Current (/v1 ZIP or assumptions) | /v2 Writer requirement | Gap / action | Applies to |
| --- | --- | --- | --- |
| metadata.json: name, version, description? | `setMetadata({ name, version?, builderName?, builderVersion? })`; description not supported | Drop/ignore `description`; set builderName/builderVersion for provenance | /v2 |
| categories: id, name, optional iconId, defaultFieldIds, optional tags:string[], description/parentCategoryId/visible | `addCategory(id, { name, appliesTo: string[], tags: Record, fields: string[], icon?, addTags?, removeTags?, terms?, color? })` | Add required `appliesTo`; convert `tags` array → object or supply default; rename `defaultFieldIds`→`fields`; map `iconId`→`icon`; strip unsupported props (description, parentCategoryId, visible) | /v2 |
| fields: id, name, type ∈ {text, textarea, number, integer, select, multiselect, boolean, date, datetime, photo, location}, options, required/defaultValue/etc. | `addField(id, { type: text|number|selectOne|selectMultiple, tagKey, label, options?, placeholder?, helperText?, appearance? })` | Split `name` → `label`; add required `tagKey`; map types (select→selectOne, multiselect→selectMultiple, textarea→text); auto-map other legacy types where feasible (see rules below). Remove required/defaultValue/visible/min/max/step | /v2 |
| icons: inline SVG or remote svgUrl, altText/tags, no enforced size | `addIcon(id, svgString)` with validation; max 2 MB; only inline SVG | Accept URLs and fetch to SVG string server-side; drop altText/tags; enforce size and valid SVG | /v2 |
| category selection: implicit/absent (CLI infers?) | `setCategorySelection({ observation: [...], track: [...] })` required before `finish()` | Derive from input order: all categories → observation list; also add to track list when `track: true`; preserve order | /v2 |
| translations: not exposed in API | `addTranslations(lang, translations)` optional; lang must be BCP-47 | Define request contract for translations; validate size limits | /v2 |
| Output: `.comapeocat` file produced by CLI, name `<metadata.name>-<version>.comapeocat` | `.comapeocat` stream from Writer after `finish()` | Align naming (can keep same pattern) | both |

### Field type auto-mapping (/v2 transformer)
- `select` → `selectOne`
- `multiselect` → `selectMultiple`
- `textarea` → `text`
- `integer` → `number` (keep step if present? drop; comapeocat ignores)
- `boolean` → `selectOne` with options `[ {label:"Yes", value:true}, {label:"No", value:false} ]`
- `date` / `datetime` → `text` (mark `appearance: "singleline"`, optional helperText like "ISO date")
- `photo` / `location` → `text` (fallback; consider helperText to flag legacy behavior)
- Unsupported after mapping -> validation error.

### Icon fetching rules (/v2)
- Accept `svgData` or `svgUrl`.
- If `svgUrl` provided: fetch server-side, enforce content-type contains `svg` or fallback to text; cap download/read to 2 MB before passing to Writer; apply timeout to avoid hanging requests.
- Run existing size check (2 MB) and SVG parse/sanitize via Writer; reject on invalid SVG.

## 6) Required code changes
- Dependencies: add `comapeocat@1.1.0`; keep `mapeo-settings-builder` for `/v1`; ensure transitive peer needs (stream, valibot already bundled).
- Schema/types: introduce versioned request DTOs (v1 passthrough ZIP; v2 JSON+icons or ZIP content spec) and type guards; add transformations for v1→v2 if we support auto-mapping.
- Validation: implement dual schemas (zod/valibot) enforcing comapeocat constraints (field types, tags object, appliesTo required, icon size checks, BCP-47 for translations); if tags missing/empty, populate a default tag (e.g., `{ categoryId: <id> }`) before validation.
- Builder refactor: split services `settingsBuilderV1` (existing CLI) vs `comapeoCatBuilderV2` (Writer pipeline with streaming); shared temp/cleanup utils.
- Controllers/routing: add `/v1` and `/v2` routes (keep root aliasing to `/v1` initially); parse multipart for ZIP uploads and/or JSON body for writer inputs; surface meaningful errors from Writer.
- Scripts: update `scripts/test-api.sh` and `scripts/test-docker.sh` to hit both versions; add sample payload/fixtures for Writer; keep existing CLI smoke tests.
- OpenAPI/README: document dual endpoints, payload schemas, limits (icon 2 MB, JSON 1 MB), field type constraints, translations and categorySelection requirements.
- Tests: unit tests for transform functions and validation, integration for both routes, golden `.comapeocat` assertions; add regression for unsupported field types and oversized icons.
- CI: ensure comapeocat install (bun/npm) in Dockerfile; consider optional flag to disable v2 in CI until stable.

## 7) Compatibility & rollback
- Keep `/v1` untouched; default/root route points to `/v1`.
- Expose `/v2` without gating; rollback by routing clients back to `/v1` if needed.
- Retain `mapeo-settings-builder` until `/v2` is validated in production; keep Docker image with both toolchains.
- If `/v2` failure occurs, route clients back to `/v1`; no shared state so rollback is route-level.
- Category selection edge: comapeocat requires non-empty `track` array; if no categories have `track: true`, fail fast with clear error rather than emitting invalid archive.

## 8) Decisions (resolved questions)
- Category selection: derive arrays from incoming category order; include category in `track` selection when `track: true` is present; otherwise only `observation`.
- Legacy field types: auto-map legacy types (boolean/date/datetime/photo/location/integer) where feasible instead of hard-failing; document mappings in transformer.
- Icons: `/v2` accepts icon URLs; server fetches to SVG string before calling Writer.
- Limits: comapeocat limits (1 MB JSON, 2 MB icon, 10k entries) accepted; add pre-checks and clear errors.
- Provenance: set `builderName: "comapeocat"` and `builderVersion` to the comapeocat library version.

## 9) Phased plan (effort: S ≤ 0.5d, M ~1d, L ~2d)
- Phase 0 (S): Wire `/v1` route explicitly; keep root alias; no feature flag.
- Phase 1 (M): Add comapeocat dependency; sketch v2 request schema and transformations; introduce validation utilities.
- Phase 2 (L): Implement `comapeoCatBuilderV2` using Writer (stream to temp file, handle icons/translation/categorySelection); robust error mapping.
- Phase 3 (M): Add routing/controller changes, version negotiation, and response naming; update scripts and fixtures.
- Phase 4 (M): Testing (unit + integration) for both paths; enforce icon/JSON limits; add OpenAPI + README updates.
- Phase 5 (S): Rollout guardrails, env flags, monitoring/logging for dual mode.
Parallelizable: validation/schema work vs builder implementation; docs vs tests once interfaces stable.

## 10) Test plan
- Unit: transformations v1→v2 (tags array→object, type mapping, icon fetcher), schema validators (field type constraints, appliesTo required, BCP-47 validation), Writer error surfacing.
- Integration: `/v1` upload ZIP (existing fixtures) still succeeds; `/v2` happy path builds `.comapeocat` matching expected contents; `/v2` rejects unsupported field type, missing appliesTo, oversized icon, invalid locale.
- CLI/scripts: update `scripts/test-api.sh` to exercise `/v1` and `/v2` (expect valid ZIP/Writer output); Docker smoke for both paths.
- Manual curls: 
  - `/v1`: `curl -F "file=@config.zip" http://localhost:3000/v1 -o out.comapeocat`
  - `/v2`: `curl -F "file=@config.zip" http://localhost:3000/v2 -o out.comapeocat` (or JSON payload once defined); unzip to verify VERSION/categories/categorySelection present.
