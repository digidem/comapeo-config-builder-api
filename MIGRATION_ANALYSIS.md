# Migration Analysis: mapeo-settings-builder → comapeocat

## Executive Summary

**Migration Complexity**: MODERATE (3-5 days)
**Breaking Changes**: YES - API schema requires significant changes
**Backward Compatibility**: DIFFICULT - schemas are fundamentally incompatible
**Recommendation**: MIGRATE FULLY to comapeocat, deprecate old format

---

## Critical Schema Differences

### 1. **Category Schema**

| Field | Current API | comapeocat | Action Required |
|-------|-------------|------------|-----------------|
| `id` | Separate parameter | Passed to `addCategory(id, ...)` | ✅ Compatible |
| `name` | ✅ Required | ✅ Required | ✅ Compatible |
| `appliesTo` | ❌ MISSING | ✅ **REQUIRED** (string[]) | 🚨 **BREAKING** - Must add |
| `tags` | Optional string[] | **REQUIRED** Record<string, any> | 🚨 **BREAKING** - Different type |
| `addTags` | ❌ MISSING | Optional Record<string, any> | ⚠️ New feature |
| `removeTags` | ❌ MISSING | Optional Record<string, any> | ⚠️ New feature |
| `fields` | `defaultFieldIds?: string[]` | `fields?: string[]` | ⚠️ Rename needed |
| `icon` | `iconId?: string` | `icon?: string` | ⚠️ Rename needed |
| `color` | ✅ Optional hex string | ✅ Optional hex string | ✅ Compatible |
| `description` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `parentCategoryId` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `visible` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `terms` | ❌ MISSING | Optional string[] | ⚠️ New feature (search) |

### 2. **Field Schema**

| Field | Current API | comapeocat | Action Required |
|-------|-------------|------------|-----------------|
| `id` | Separate parameter | Passed to `addField(id, ...)` | ✅ Compatible |
| `name` | ✅ Required | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `label` | ❌ MISSING | ✅ **REQUIRED** | 🚨 **BREAKING** - Must add |
| `tagKey` | ❌ MISSING | ✅ **REQUIRED** | 🚨 **BREAKING** - Must add |
| `type` | text/textarea/number/integer/select/multiselect/boolean/date/datetime/photo/location | text/number/selectOne/selectMultiple | 🚨 **BREAKING** - Reduced types |
| `placeholder` | ❌ MISSING | Optional | ⚠️ New feature |
| `helperText` | ❌ MISSING | Optional | ⚠️ New feature |
| `appearance` | ❌ MISSING | Optional (singleline/multiline) | ⚠️ New feature (text only) |
| `description` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `options` | SelectOption[] | Same structure | ✅ Compatible |
| `iconId` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `tags` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `required` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `defaultValue` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `visible` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `min/max/step` | ✅ Optional (number) | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |

### 3. **Metadata Schema**

| Field | Current API | comapeocat | Action Required |
|-------|-------------|------------|-----------------|
| `name` | ✅ Required | ✅ Required | ✅ Compatible |
| `version` | ✅ Required | Optional | ⚠️ Now optional |
| `builderName` | Optional | Optional | ✅ Compatible |
| `builderVersion` | Optional | Optional | ✅ Compatible |
| `description` | Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `buildDateValue` | ❌ Auto-generated | ✅ Auto-added by Writer | ✅ No action |

### 4. **Icon Schema**

| Field | Current API | comapeocat | Action Required |
|-------|-------------|------------|-----------------|
| `id` | Separate parameter | Passed to `addIcon(id, ...)` | ✅ Compatible |
| `svgData` | ✅ Optional (inline SVG) | ✅ Required (string) | ✅ Compatible |
| `svgUrl` | ✅ Optional (fetch remote) | ❌ NOT SUPPORTED | 🚨 **BREAKING** - Must fetch before |
| `altText` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |
| `tags` | ✅ Optional | ❌ NOT IN SCHEMA | 🚨 **REMOVED** |

### 5. **New Features in comapeocat**

| Feature | Description | Migration Impact |
|---------|-------------|------------------|
| `categorySelection` | Maps document types to categories | NEW - Optional enhancement |
| Translation validation | BCP-47 locale validation | STRICTER - May reject invalid locales |
| Archive size limits | MAX_JSON_SIZE, MAX_ICON_SIZE | NEW - May reject large inputs |
| Streaming API | Writer.outputStream | BETTER - More memory efficient |

---

## API Changes Required

### Current JSON Mode API
```typescript
POST /build
{
  "metadata": { "name": "...", "version": "...", "description": "..." },
  "categories": [
    {
      "id": "tree",
      "name": "Trees",
      "description": "...",
      "iconId": "tree_icon",
      "parentCategoryId": "...",
      "defaultFieldIds": ["species"]
    }
  ],
  "fields": [
    {
      "id": "species",
      "name": "Species",
      "type": "select",
      "options": [...]
    }
  ],
  "icons": [
    {
      "id": "tree_icon",
      "svgUrl": "https://...",  // OR svgData
      "altText": "..."
    }
  ]
}
```

### Required comapeocat API
```typescript
POST /build
{
  "metadata": { "name": "...", "version": "..." },
  "categories": [
    {
      "id": "tree",
      "name": "Trees",
      "appliesTo": ["observation"],  // REQUIRED NEW
      "tags": { "natural": "tree" }, // REQUIRED NEW (Record not array)
      "fields": ["species"],         // renamed from defaultFieldIds
      "icon": "tree_icon"            // renamed from iconId
    }
  ],
  "fields": [
    {
      "id": "species",
      "label": "Species",            // renamed from "name"
      "tagKey": "species",           // REQUIRED NEW
      "type": "selectOne",           // renamed from "select"
      "options": [...]
    }
  ],
  "icons": [
    {
      "id": "tree_icon",
      "svgData": "<svg>...</svg>"    // svgUrl NOT supported, must fetch first
    }
  ],
  "categorySelection": {             // OPTIONAL NEW
    "observation": { "categoryIds": ["tree"] }
  }
}
```

---

## Migration Implementation Plan

### Phase 1: Core Library Integration (1-2 days)

**Files to Modify:**
- `package.json` - Add `comapeocat` dependency
- `src/services/jsonBuilder.ts` - Replace CLI with Writer API
- `src/types/schema.ts` - Update to match comapeocat schema

**Key Changes:**
```typescript
// OLD: Shell command to mapeo-settings-builder CLI
await runShellCommand(`mapeo-settings-builder build ${tmpDir} -o ${buildPath}`);

// NEW: Direct comapeocat Writer API
import { Writer } from 'comapeocat';
import { pipeline } from 'stream/promises';

const writer = new Writer();
writer.setMetadata({ name: request.metadata.name, version: request.metadata.version });

for (const cat of request.categories) {
  writer.addCategory(cat.id, {
    name: cat.name,
    appliesTo: cat.appliesTo,    // NEW REQUIRED
    tags: cat.tags,              // NOW REQUIRED Record
    fields: cat.fields,
    icon: cat.icon,
    color: cat.color
  });
}

for (const field of request.fields) {
  writer.addField(field.id, {
    label: field.label,          // RENAMED from name
    tagKey: field.tagKey,        // NEW REQUIRED
    type: field.type,
    options: field.options
  });
}

for (const icon of request.icons) {
  // Must fetch svgUrl BEFORE adding (no longer supported in addIcon)
  const svgData = icon.svgUrl ? await fetchSvg(icon.svgUrl) : icon.svgData;
  await writer.addIcon(icon.id, svgData);
}

writer.finish();

// Stream to file
await pipeline(writer.outputStream, fs.createWriteStream(buildPath));
```

### Phase 2: Schema Validation Updates (1 day)

**Files to Modify:**
- `src/validators/schema.ts` - Update validation rules
- `src/types/schema.ts` - Update TypeScript types

**Breaking Changes:**
1. `Category.appliesTo` - NEW REQUIRED field (string[])
2. `Category.tags` - NOW REQUIRED (changed from optional string[] to Record)
3. `Field.label` - RENAMED from `Field.name`
4. `Field.tagKey` - NEW REQUIRED field
5. `Field.type` - Limited to: text, number, selectOne, selectMultiple
6. `Icon.svgUrl` - REMOVED (must fetch externally and provide svgData)

**Removed Features** (breaking):
- Category: `description`, `parentCategoryId`, `visible`
- Field: `description`, `iconId`, `tags`, `required`, `defaultValue`, `visible`, `min`, `max`, `step`
- Metadata: `description`
- Icon: `altText`, `tags`
- Field types: `textarea`, `integer`, `boolean`, `date`, `datetime`, `photo`, `location`

### Phase 3: Backward Compatibility (1 day - OPTIONAL)

**Option A: Support Both Schemas (Complex)**
- Add version detection (`v1` vs `v2`)
- Transform v1 requests to v2 format
- Keep mapeo-settings-builder for v1
- Use comapeocat for v2

**Option B: Migration Guide Only (Recommended)**
- Provide clear migration documentation
- Return helpful error messages for old schema
- Deprecate immediately, remove in 3 months

### Phase 4: Testing & Documentation (1 day)

**Files to Create/Update:**
- Update integration tests for new schema
- Update README.md with new schema docs
- Add migration guide
- Update OpenAPI spec

---

## Migration Effort Estimate

| Task | Effort | Priority | Risk |
|------|--------|----------|------|
| Add comapeocat dependency | 0.5 day | HIGH | LOW |
| Replace jsonBuilder.ts | 1 day | HIGH | MEDIUM |
| Update schema types | 0.5 day | HIGH | LOW |
| Update validators | 0.5 day | HIGH | MEDIUM |
| Update tests | 1 day | HIGH | MEDIUM |
| Update docs | 0.5 day | MEDIUM | LOW |
| Backward compat (optional) | 1 day | LOW | HIGH |
| **TOTAL (without compat)** | **4 days** | | |
| **TOTAL (with compat)** | **5 days** | | |

---

## Recommendation

### ✅ **MIGRATE FULLY** (4 days)

**Reasons:**
1. **Schemas are fundamentally incompatible** - trying to support both adds complexity
2. **comapeocat is the future** - official library, better maintained
3. **No CLI dependency** - faster, more reliable, better error messages
4. **Better API** - streaming, validation, type-safe
5. **Current PR is already broken** - no additional breakage from migration

**Migration Path:**
1. Update package.json to use `comapeocat` v1.1.0
2. Rewrite `src/services/jsonBuilder.ts` to use Writer API
3. Update schema to match comapeocat requirements
4. Add clear migration guide for API consumers
5. Update all tests and documentation
6. Release as v2.0.0 with breaking changes clearly documented

**Deprecation Strategy:**
- Mark v1 API as deprecated immediately
- Provide 3-month transition period
- Remove mapeo-settings-builder dependency in v3.0.0

---

## Key Migration Challenges

### 1. **Category.appliesTo is Required**
comapeocat requires categories to specify which document types they apply to. The current API has no equivalent field.

**Solution:**
- Add `appliesTo` as required field in API schema
- Default to `["observation"]` if migrating from v1
- Document this requirement clearly

### 2. **Category.tags Changed from Array to Record**
Current API uses `tags?: string[]`, but comapeocat requires `tags: Record<string, any>` with at least one entry.

**Solution:**
- Change API schema to accept Record format
- If empty, provide default like `{ "type": "category" }`
- Validate at least one tag exists

### 3. **Field.name → Field.label + Field.tagKey**
Current API only has `name`, but comapeocat requires both `label` (display) and `tagKey` (data storage key).

**Solution:**
- Add `tagKey` as required field
- Rename `name` to `label`
- Provide migration guide with examples

### 4. **Icon.svgUrl No Longer Supported**
comapeocat Writer only accepts SVG strings, not URLs.

**Solution:**
- Fetch URLs in the API layer before calling Writer
- Keep existing URL validation and security checks
- This is actually an implementation detail, API can still accept URLs

### 5. **Reduced Field Types**
comapeocat only supports 4 field types: text, number, selectOne, selectMultiple.

**Solution:**
- Document unsupported types: textarea, integer, boolean, date, datetime, photo, location
- Return validation error if unsupported type provided
- Map compatible types (textarea→text, integer→number, select→selectOne, multiselect→selectMultiple)

---

## Next Steps

1. ✅ **Confirm migration approach** with team
2. Create feature branch: `feat/migrate-to-comapeocat`
3. Install comapeocat: `bun add comapeocat@^1.1.0`
4. Rewrite jsonBuilder.ts to use Writer API
5. Update schema types and validators
6. Fix all tests
7. Update documentation
8. PR review and merge
9. Release as v2.0.0 with breaking changes clearly documented

---

## Questions for Team

1. **Is backward compatibility required?** If yes, adds 1+ days and significant complexity
2. **What is the migration timeline for API consumers?** Affects deprecation strategy
3. **Are the removed fields (description, parentCategoryId, etc.) critical?** May need to preserve in separate metadata
4. **Should we map field types automatically?** (e.g., select→selectOne, textarea→text)
5. **Default value for Category.appliesTo?** Suggest `["observation"]` for all categories

