# Agent Guide - CoMapeo Config Builder API

This file provides guidance to AI coding agents working with this codebase. For detailed information, refer to the context files linked below.

## Project Overview

This is a dual-mode REST API that processes CoMapeo configuration files. It provides two endpoints:

- **`/v1` (legacy)**: Accepts ZIP files containing CoMapeo configuration settings, processes them using the `mapeo-settings-builder` CLI tool
- **`/v2` (new)**: Accepts JSON payloads, uses `comapeocat@1.1.0` Writer with strict validation and type mapping

Both endpoints return `.comapeocat` files ready for use in CoMapeo applications.

**Runtime**: Bun (JavaScript runtime - v1.3.2 locally and in Docker)
**Framework**: Elysia (Bun-native web framework)
**Key Dependencies**:
- `comapeocat@1.1.0` - Used by v2 endpoint for direct archive creation
- `mapeo-settings-builder@^6.0.0` - Used by v1 endpoint (must be installed globally)

**Key Entry Points**:
- `src/index.ts` - Application entry point, starts the server
- `src/app.ts` - Elysia app factory with route definitions
- `src/controllers/settingsController.ts` - Dispatches to v1/v2 builders
- `src/services/settingsBuilder.ts` - Legacy v1 build logic (ZIP → CLI)
- `src/services/comapeocatBuilder.ts` - New v2 build logic (JSON → comapeocat Writer)

## Development Commands

```bash
# Install dependencies
bun install

# Development mode with hot reload
bun run dev

# Production mode
bun run start

# Build for deployment
bun run build

# Linting
bun run lint

# Run all tests
bun test

# Run specific test suites
bun run test:unit
bun run test:integration

# Run a single test file
bun test src/tests/unit/utils/shell.test.ts

# Test both API endpoints (requires running server)
./scripts/test-api.sh
./scripts/test-api.sh --url http://localhost:3000 --file path/to/config.zip --output response.comapeocat
```

## API Usage

### v1 Endpoint (Legacy - ZIP Upload)
```bash
# Upload a ZIP file and receive a .comapeocat file
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@config.zip" \
  --output output.comapeocat \
  http://localhost:3000/v1
```

### v2 Endpoint (JSON Payload)
```bash
# Send JSON payload and receive a .comapeocat file
curl -X POST \
  -H "Content-Type: application/json" \
  -d @config.json \
  --output output.comapeocat \
  http://localhost:3000/v2
```

## Architecture Overview

### Request Flow
- **v1**: `Client → Controller → settingsBuilder → mapeo-settings-builder CLI → .comapeocat file`
- **v2**: `Client → Controller → comapeocatBuilder → comapeocat Writer → .comapeocat file`

### Main Components
- **App** (`src/app.ts`): Elysia app with routes `/`, `/v1`, `/v2` (root redirects to v1); includes CORS, logger, errorHandler, and body size validation
- **Controllers** (`src/controllers/`): Route handlers that dispatch to appropriate services
- **Services**:
  - `settingsBuilder.ts` (v1): Unzips, finds `metadata.json` recursively, defaults filename to `config-v1` if missing, runs CLI via `runShellCommand`, polls for output
  - `comapeocatBuilder.ts` (v2): Validates payload (1MB size cap, 10k entries, BCP-47 locales), maps legacy field types, derives category selection, fetches SVG icons with timeout/size checks (2MB limit), builds via `Writer` with provenance metadata
- **Config** (`src/config/app.ts`): Byte limits, icon fetch timeout, temp prefixes, max entries
- **Middleware**: Logger, error handler with custom error types
- **Tests**: Unit and integration tests under `src/tests/`

### Design Patterns
- Factory pattern for app creation
- Polling pattern for v1 async processing (120s timeout)
- Temp resource management with unique prefixes
- Streaming body validation to prevent DoS attacks

## Context Documentation

Comprehensive documentation is organized into the following files:

### 🏗️ [context/architecture.md](context/architecture.md)
**When to read**: Understanding overall structure, adding new features, refactoring

**Contains**:
- System architecture and request flow
- Folder structure and file organization
- Component relationships and interactions
- Design patterns (factory, polling, temp resource management)
- Key architectural decisions

**Quick Reference**:
- Request flow: `Client → Controller → Service → CLI Tool/Writer → Response`
- Main components: App, Controllers, Services, Middleware, Utilities
- Asynchronous processing with polling pattern (v1) or direct Writer (v2)

---

### 🌐 [context/api.md](context/api.md)
**When to read**: Working with endpoints, modifying request/response handling

**Contains**:
- API endpoints documentation (`GET /health`, `POST /`, `POST /v1`, `POST /v2`)
- Request/response formats for both v1 and v2
- Error handling and status codes
- CORS configuration
- Body size validation and security measures
- Example curl commands

**Quick Reference**:
- Health check: `GET /health`
- Build config v1: `POST /v1` (multipart/form-data with "file" field)
- Build config v2: `POST /v2` (application/json with validated schema)
- v1 input: ZIP with `metadata.json` (name, version)
- v2 input: JSON with metadata, categories, fields, icons (≤1MB)
- Response: `.comapeocat` file (binary)

---

### ⚙️ [context/services.md](context/services.md)
**When to read**: Modifying build logic, debugging processing issues

**Contains**:
- `buildSettingsV1()` function detailed walkthrough (ZIP processing)
- `buildComapeoCatV2()` function detailed walkthrough (JSON processing)
- Shell command execution (`runShellCommand()`)
- Icon fetching with timeout and size validation
- Field type mapping (v2: select→selectOne, multiselect→selectMultiple, etc.)
- Error handling utilities
- Custom error types
- Service design patterns

**Quick Reference**:
- v1 service: `src/services/settingsBuilder.ts`
  - Process: Extract ZIP → Read metadata → Run CLI → Poll for output → Return file
  - Polling: 120 attempts × 1000ms = 2 minutes timeout
- v2 service: `src/services/comapeocatBuilder.ts`
  - Process: Validate JSON → Map types → Fetch icons → Write via comapeocat → Return file
  - Validation: BCP-47 locales, entry counts, icon sizes, path traversal prevention

---

### 🔧 [context/config.md](context/config.md)
**When to read**: Changing configuration, adding environment variables

**Contains**:
- Application configuration (`src/config/app.ts`)
- Environment variables
- TypeScript configuration
- Build settings
- Security limits

**Quick Reference**:
```typescript
{
  port: 3000,                    // Server port
  tempDirPrefix: 'comapeo-settings-',
  maxAttempts: 120,              // Polling attempts (v1)
  delayBetweenAttempts: 1000,    // Polling delay (ms)
  jsonByteLimit: 10_000_000,     // 10MB JSON limit (v2, configurable via MAX_JSON_BODY_SIZE env var)
  iconByteLimit: 2_000_000,      // 2MB icon limit (v2)
  maxEntries: 10_000,            // Max categories + fields
  iconFetchTimeoutMs: 5_000,     // Icon fetch timeout (ms)
  validationTimeoutMs: 15_000    // Validation timeout (ms)
}
```

---

### 📦 [context/dependencies.md](context/dependencies.md)
**When to read**: Adding dependencies, updating packages, debugging dependency issues

**Contains**:
- Runtime dependencies (Elysia, CORS, adm-zip, comapeocat, mapeo-settings-builder)
- Development dependencies
- Node.js built-in modules
- Bun runtime specifics
- Security overrides

**Quick Reference**:
- Web framework: `elysia@^1.2.25`
- ZIP handling: `adm-zip@^0.5.16`
- v2 builder: `comapeocat@1.1.0`
- v1 CLI: `mapeo-settings-builder@^6.0.0` (global install)
- Runtime: Bun 1.3.2 (pinned in Docker and used locally)

---

### 🧪 [context/testing.md](context/testing.md)
**When to read**: Writing tests, debugging test failures, understanding test patterns

**Contains**:
- Test organization and structure
- Unit test patterns for v1 and v2 services
- Integration tests for both endpoints
- Test utilities and helpers
- Mocking strategies
- Shell script tests

**Quick Reference**:
- Test runner: Bun's built-in test runner
- Commands: `bun test`, `bun run test:unit`, `bun run test:integration`
- Test helpers: `src/tests/utils/testHelpers.ts`
- Shell test: `./scripts/test-api.sh` (tests both v1 and v2)
- Docker test: `./scripts/test-docker.sh` (tolerates v1 failures, requires v2 success)

---

### 🚀 [context/deployment.md](context/deployment.md)
**When to read**: Deploying, configuring CI/CD, containerizing

**Contains**:
- Docker deployment
- GitHub Container Registry
- Bare metal deployment
- CI/CD workflows
- Process management
- Scaling and monitoring

**Quick Reference**:
- Docker build: `docker build -t comapeo-config-builder-api .`
- Docker run: `docker run -p 3000:3000 comapeo-config-builder-api`
- Image: `communityfirst/comapeo-config-builder-api:latest`
- CI: Tests run before Docker build in GitHub Actions
- Note: Docker may have issues with v1 endpoint (mapnik dependency), but v2 works reliably

---

## Important v2 Validation Rules

The v2 endpoint enforces strict validation to ensure data quality:

1. **Size Limits**:
   - JSON body: ≤10MB (validated during parsing to prevent DoS, configurable via `MAX_JSON_BODY_SIZE` environment variable)
   - SVG icons: ≤2MB each
   - Total entries (categories + fields): ≤10,000

2. **Locale Validation**:
   - All locales must be valid BCP-47 language tags
   - Supports extensions (e.g., `en-US-x-custom`)

3. **Required Fields**:
   - Category: `id`, `name`, `appliesTo`, `tags` (defaults to `{categoryId: <id>}`)
   - Field: `id`, `name`, `tagKey`, `type`
   - If any category has `track: true`, category selection must include "track"

4. **Field Type Mapping**:
   - `select` → `selectOne`
   - `multiselect` → `selectMultiple`
   - `textarea` → `text`
   - `integer` → `number`
   - `boolean` → `selectOne` (Yes/No options)
   - `date`/`datetime`/`photo`/`location` → `text`

5. **Security**:
   - Path traversal prevention (no `/` or `\` in names/versions)
   - Icon URL validation with timeout protection
   - Stream-based body size validation (prevents chunked encoding DoS)

## Docker Notes

- Base image: `node:24-bookworm-slim`
- Installs Bun 1.3.2 and `mapeo-settings-builder` globally
- v1 endpoint may require mapnik (can fail in Docker)
- v2 endpoint works reliably without additional dependencies
- Exposes port 3000
- Entrypoint: `bun run index.ts`
- CI script tolerates v1 failures but requires v2 to pass

## Common Tasks Quick Reference

### Adding a New Endpoint

1. Add route in `src/app.ts`
2. Create controller function in `src/controllers/`
3. Add business logic in `src/services/` if needed
4. Write tests in `src/tests/unit/controllers/` and `src/tests/integration/`
5. Update `context/api.md` documentation

### Modifying Build Process

**For v1**:
1. Edit `src/services/settingsBuilder.ts`
2. Update tests in `src/tests/unit/services/`
3. Test with `./scripts/test-api.sh`

**For v2**:
1. Edit `src/services/comapeocatBuilder.ts`
2. Update tests in `src/tests/unit/services/` and `src/tests/integration/`
3. Test with curl or `./scripts/test-api.sh`

### Adding Configuration

1. Add to `src/config/app.ts`
2. Add environment variable support if needed
3. Update `context/config.md`
4. Update README.md

### Fixing a Bug

1. Write a failing test first (`src/tests/`)
2. Fix the bug in source code
3. Verify test passes
4. Run full test suite: `bun test`
5. Update documentation if needed

---

## File Location Quick Reference

### Core Application
- Entry point: `src/index.ts`
- App factory: `src/app.ts`
- Config: `src/config/app.ts`

### Controllers
- Main endpoints: `src/controllers/settingsController.ts`
- Health check: `src/controllers/healthController.ts`

### Services
- v1 build logic: `src/services/settingsBuilder.ts`
- v2 build logic: `src/services/comapeocatBuilder.ts`

### Utilities
- Shell commands: `src/utils/shell.ts`
- Error helpers: `src/utils/errorHelpers.ts`

### Middleware
- Logger: `src/middleware/logger.ts`
- Error handler: `src/middleware/errorHandler.ts`

### Types
- Custom errors: `src/types/errors.ts`

### Tests
- Unit tests: `src/tests/unit/`
- Integration: `src/tests/integration/`
- Helpers: `src/tests/utils/testHelpers.ts`

### Configuration Files
- Package: `package.json`
- TypeScript: `tsconfig.json`
- Docker: `Dockerfile`

### CI/CD
- Docker test: `.github/workflows/docker-test.yml`

### Scripts
- API test: `scripts/test-api.sh` (tests both v1 and v2)
- Docker test: `scripts/test-docker.sh`

---

## Important Patterns and Conventions

### Async/Await Pattern
All file operations and async functions use async/await (no callbacks).

### Error Handling
```typescript
try {
  // Operation
} catch (error) {
  console.error('Error:', error);
  return errorResponse(error);
}
```

### File Paths
Always use `path.join()` for cross-platform compatibility.

### Temporary Files
Use `fs.mkdtemp()` with unique prefix for isolation.

### Testing
- Mock external dependencies in unit tests
- Use real implementations in integration tests
- Clean up resources after tests
- Test both v1 and v2 endpoints

---

## Key Architectural Decisions

1. **Dual-Mode API**: Support both legacy v1 (ZIP) and modern v2 (JSON) workflows
2. **Bun Runtime**: Chosen for performance and built-in TypeScript support
3. **Elysia Framework**: Bun-native, type-safe, fast
4. **v1 Polling Over Watching**: Simpler, more reliable across platforms
5. **v2 Direct Writer**: Fast, synchronous processing with comapeocat
6. **Stateless Design**: No database, easy to scale horizontally
7. **Docker Deployment**: Node base image for native dependency support
8. **Security First**: Stream-based validation, size limits, path traversal prevention

---

## Known Limitations and TODOs

1. **v1 Docker Issues**: mapnik dependencies may cause v1 endpoint failures in Docker (v2 recommended)
2. **No Authentication**: Open API, needs auth for production
3. **No Rate Limiting**: Should be added for production
4. **CORS Open**: Currently allows all origins (configure for production)
5. **Fixed Timeouts**: May need tuning based on usage patterns

---

## Security Considerations

### v2 Endpoint Protection

The v2 endpoint implements defense-in-depth security:

1. **DoS Prevention**: Body size validation during parsing (not after) prevents memory exhaustion from chunked encoding attacks
2. **Path Traversal**: Metadata names/versions cannot contain path separators
3. **Icon Security**: URL fetching has timeout and size limits
4. **Input Validation**: Strict schema validation with type checking
5. **Error Handling**: ValidationErrors properly unwrapped from ParseErrors

## Getting Help

- **README.md**: Project overview and setup instructions
- **Context files**: Detailed documentation on specific topics (see above)
- **Tests**: Examples of usage patterns and expected behavior
- **This file**: Quick reference and common tasks

---

## Development Workflow

### Local Development
```bash
bun install              # Install dependencies
bun run dev              # Start with hot reload
bun test                 # Run tests
bun run lint             # Check code style
```

### Testing Changes
```bash
# Start server
bun run dev

# In another terminal, test both endpoints
./scripts/test-api.sh
```

### Before Committing
```bash
bun run lint             # Lint
bun test                 # Run all tests
bun tsc --noEmit        # Type check
```

---

## Tips for AI Agents

1. **Always read the relevant context file** before making changes to unfamiliar code
2. **Check tests** to understand expected behavior for both v1 and v2 endpoints
3. **Follow existing patterns** in the codebase
4. **Update documentation** when making significant changes
5. **Write tests** for new features and bug fixes (cover both v1 and v2 when applicable)
6. **Use TypeScript** types for safety
7. **Keep it simple** - this is a focused, dual-mode API
8. **Security matters** - always validate input and enforce limits

---

## Questions to Ask Yourself

Before modifying code, consider:

- Which context file(s) should I read first?
- Does this affect v1, v2, or both endpoints?
- Do existing tests cover this area?
- Are there similar patterns elsewhere in the codebase?
- Do I need to update documentation?
- Will this change affect the API contract?
- Should I add new tests?
- Are there any security implications?
- Does this introduce DoS or injection vulnerabilities?

---

*Last updated: 2025-01-25*
*For detailed information, always refer to the specific context files.*
