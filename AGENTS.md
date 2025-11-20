# Agent Guide - CoMapeo Config Builder API

This file provides guidance to AI coding agents working with this codebase. For detailed information, refer to the context files linked below.

## Project Overview

This is a REST API that processes CoMapeo configuration files. It accepts ZIP files containing CoMapeo configuration settings, processes them using the `mapeo-settings-builder` CLI tool, and returns `.comapeocat` files ready for use in CoMapeo applications.

**Runtime**: Bun (JavaScript runtime, pinned to v1.0.16)
**Framework**: Elysia (Bun-native web framework)
**Key Dependency**: `mapeo-settings-builder` (must be installed globally)

**Key Entry Points**:
- `src/index.ts` - Application entry point, starts the server
- `src/app.ts` - Elysia app factory with route definitions
- `src/services/settingsBuilder.ts` - Core build logic

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

# Test the API with a real ZIP file (requires running server)
./scripts/test-api.sh
./scripts/test-api.sh --url http://localhost:3000 --file path/to/config.zip --output response.comapeocat
```

## API Usage

```bash
# Upload a ZIP file and receive a .comapeocat file
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@config.zip" \
  --output output.comapeocat \
  http://localhost:3000/
```

## Quick Start

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
- Request flow: `Client → Controller → Service → CLI Tool → Response`
- Main components: App, Controllers, Services, Middleware, Utilities
- Asynchronous processing with polling pattern

---

### 🌐 [context/api.md](context/api.md)
**When to read**: Working with endpoints, modifying request/response handling

**Contains**:
- API endpoints documentation (`GET /health`, `POST /`)
- Request/response formats
- Error handling and status codes
- CORS configuration
- Example curl commands

**Quick Reference**:
- Health check: `GET /health`
- Build config: `POST /` (multipart/form-data with "file" field)
- Expected input: ZIP with `metadata.json` (name, version)
- Response: `.comapeocat` file (binary)

---

### ⚙️ [context/services.md](context/services.md)
**When to read**: Modifying build logic, debugging processing issues

**Contains**:
- `buildSettings()` function detailed walkthrough
- Shell command execution (`runShellCommand()`)
- Error handling utilities
- Custom error types
- Service design patterns

**Quick Reference**:
- Main service: `src/services/settingsBuilder.ts`
- Process: Extract ZIP → Read metadata → Run CLI → Poll for output → Return file
- Polling: 120 attempts × 1000ms = 2 minutes timeout
- Cleanup currently disabled (line 58)

---

### 🔧 [context/config.md](context/config.md)
**When to read**: Changing configuration, adding environment variables

**Contains**:
- Application configuration (`src/config/app.ts`)
- Environment variables
- TypeScript configuration
- Build settings

**Quick Reference**:
```typescript
{
  port: 3000,                    // Server port
  tempDirPrefix: 'comapeo-settings-',
  maxAttempts: 120,              // Polling attempts
  delayBetweenAttempts: 1000     // Polling delay (ms)
}
```

---

### 📦 [context/dependencies.md](context/dependencies.md)
**When to read**: Adding dependencies, updating packages, debugging dependency issues

**Contains**:
- Runtime dependencies (Elysia, CORS, adm-zip, mapeo-settings-builder)
- Development dependencies
- Node.js built-in modules
- Bun runtime specifics
- Security overrides

**Quick Reference**:
- Web framework: `elysia@^1.2.25`
- ZIP handling: `adm-zip@^0.5.16`
- External CLI: `mapeo-settings-builder@^6.0.0` (global install)
- Runtime: Bun 1.0.16 (pinned)

---

### 🧪 [context/testing.md](context/testing.md)
**When to read**: Writing tests, debugging test failures, understanding test patterns

**Contains**:
- Test organization and structure
- Unit test patterns
- Integration tests
- Test utilities and helpers
- Mocking strategies
- Shell script tests

**Quick Reference**:
- Test runner: Bun's built-in test runner
- Commands: `bun test`, `bun run test:unit`, `bun run test:integration`
- Test helpers: `src/tests/utils/testHelpers.ts`
- Shell test: `./scripts/test-api.sh`

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

---

## Common Tasks Quick Reference

### Adding a New Endpoint

1. Add route in `src/app.ts`
2. Create controller function in `src/controllers/`
3. Add business logic in `src/services/` if needed
4. Write tests in `src/tests/unit/controllers/`
5. Update `context/api.md` documentation

### Modifying Build Process

1. Edit `src/services/settingsBuilder.ts`
2. Update tests in `src/tests/unit/services/`
3. Test with `./scripts/test-api.sh`
4. Update `context/services.md` if significant changes

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
- Main endpoint: `src/controllers/settingsController.ts`
- Health check: `src/controllers/healthController.ts`

### Services
- Build logic: `src/services/settingsBuilder.ts`

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
- Deploy: `.github/workflows/deploy.yml`
- Docker test: `.github/workflows/docker-test.yml`

### Scripts
- API test: `scripts/test-api.sh`
- Docker test: `scripts/test-mapeo-config.sh`

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

---

## Key Architectural Decisions

1. **Bun Runtime**: Chosen for performance and built-in TypeScript support
2. **Elysia Framework**: Bun-native, type-safe, fast
3. **Polling Over Watching**: Simpler, more reliable across platforms
4. **Stateless Design**: No database, easy to scale horizontally
5. **Docker Deployment**: Node base image for native dependency support
6. **CLI Integration**: Uses existing `mapeo-settings-builder` instead of reimplementing

---

## Known Limitations and TODOs

1. **Cleanup Disabled**: Temp directory cleanup commented out (line 58 in `settingsBuilder.ts`)
2. **No Authentication**: Open API, needs auth for production
3. **No Rate Limiting**: Should be added for production
4. **No File Size Limits**: Should be configured
5. **Fixed Timeout**: 2-minute build timeout may need tuning
6. **CORS Open**: Currently allows all origins

---

## Important Notes

- The `mapeo-settings-builder` CLI must be installed globally in the execution environment
- Input ZIP must contain a `metadata.json` file with `name` and `version` fields
- Build process is asynchronous and uses polling with configurable timeout (default: 120s)
- CORS is enabled via `@elysiajs/cors`
- TypeScript is configured for strict mode with ESNext target
- Temporary directory cleanup is currently commented out in `settingsBuilder.ts:58` but should be enabled for production

## Getting Help

- **README.md**: Project overview and setup instructions
- **Context files**: Detailed documentation on specific topics (see above)
- **Tests**: Examples of usage patterns and expected behavior

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

# In another terminal, test API
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
2. **Check tests** to understand expected behavior
3. **Follow existing patterns** in the codebase
4. **Update documentation** when making significant changes
5. **Write tests** for new features and bug fixes
6. **Use TypeScript** types for safety
7. **Keep it simple** - this is a focused, single-purpose API

---

## Questions to Ask Yourself

Before modifying code, consider:

- Which context file(s) should I read first?
- Do existing tests cover this area?
- Are there similar patterns elsewhere in the codebase?
- Do I need to update documentation?
- Will this change affect the API contract?
- Should I add new tests?
- Are there any security implications?

---

*Last updated: 2025-01-20*
*For detailed information, always refer to the specific context files.*
