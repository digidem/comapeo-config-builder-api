# ADR 001: JSON API over ZIP Upload

## Status

Accepted (v2.0.0)

## Context

The original API (v1.x) required users to create a properly structured ZIP file with configuration data spread across multiple JSON files (metadata.json, icons/, categories/, fields/, etc.). This approach had several limitations:

1. **Complexity**: Users had to understand the exact directory structure and file organization
2. **Error-prone**: Manual ZIP creation led to common mistakes (wrong paths, missing files, incorrect structure)
3. **Poor DX**: Required external tools to create/modify configurations
4. **Validation timing**: Errors were only discovered after ZIP extraction
5. **No programmatic generation**: Difficult to generate configurations from code

We needed a more developer-friendly approach that would:
- Reduce cognitive load
- Enable programmatic configuration generation
- Provide immediate validation feedback
- Maintain backward compatibility

## Decision

We will implement a **JSON-first API** (v2.0.0) with the following characteristics:

### Primary Mode: JSON POST
```typescript
POST /build
Content-Type: application/json

{
  "metadata": { "name": "...", "version": "..." },
  "icons": [{ "id": "...", "svgData": "..." }],
  "categories": [...],
  "fields": [...]
}
```

### Features:
1. **Single request**: All configuration data in one JSON payload
2. **Inline SVG data**: Icons can be embedded directly or fetched from URLs
3. **Immediate validation**: Schema validation before processing
4. **Type safety**: Full TypeScript types for request/response
5. **Backward compatibility**: Legacy ZIP mode still supported with deprecation warning

### Implementation details:
- New `/build` endpoint handles both JSON and ZIP modes (auto-detected via Content-Type)
- Legacy `/` endpoint preserved for backward compatibility
- JSON mode internally converts to temporary directory structure for mapeo-settings-builder CLI
- Temporary files cleaned up after build completes

## Consequences

### Positive:
- **Better DX**: Developers can generate configurations programmatically
- **Immediate feedback**: Validation errors returned before processing
- **Simpler mental model**: Single JSON object instead of file structure
- **Easier testing**: JSON payloads easier to create in tests
- **API evolution**: JSON schema can be versioned and extended
- **Documentation**: OpenAPI/Swagger spec possible

### Negative:
- **Temporary files**: JSON mode must create temporary ZIP internally (performance overhead)
- **Backward compatibility burden**: Must maintain both modes
- **Migration effort**: Existing users must update to new format

### Mitigation:
- Performance overhead acceptable (~10-50ms for file I/O)
- Legacy ZIP mode remains functional with deprecation warnings
- Migration guide provided in documentation
- Both modes share same build pipeline (mapeo-settings-builder CLI)

## Alternatives Considered

### Alternative 1: GraphQL API
**Rejected**: Over-engineered for single-endpoint use case, adds complexity

### Alternative 2: Pure ZIP with Better Tooling
**Rejected**: Doesn't solve fundamental UX issues, still requires external tools

### Alternative 3: Multipart Form Data
**Rejected**: Complex for nested structures, poor type safety

## References

- Original ZIP format: `context/services.md`
- JSON schema: `src/types/schema.ts`
- Validation logic: `src/validators/schema.ts`
- Build controller: `src/controllers/buildController.ts`
