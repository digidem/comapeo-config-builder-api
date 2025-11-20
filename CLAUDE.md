# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a REST API that processes CoMapeo configuration files. It accepts ZIP files containing CoMapeo configuration settings, processes them using the `mapeo-settings-builder` CLI tool, and returns `.comapeocat` files ready for use in CoMapeo applications.

**Runtime**: Bun (JavaScript runtime, pinned to v1.0.16)
**Framework**: Elysia (Bun-native web framework)
**Key Dependency**: `mapeo-settings-builder` (must be installed globally)

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

## Architecture

### Request Flow

1. **API Entry** (`src/app.ts`): Elysia app with single POST endpoint at `/`
2. **Controller** (`src/controllers/settingsController.ts`): Handles file upload, converts File to ArrayBuffer
3. **Service** (`src/services/settingsBuilder.ts`): Core processing logic
   - Creates temporary directory with `fs.mkdtemp()`
   - Extracts ZIP using `adm-zip`
   - Reads `metadata.json` to determine output filename
   - Spawns `mapeo-settings-builder build` command via `runShellCommand()`
   - Polls for output file (max 120 attempts, 1s intervals)
   - Returns path to built `.comapeocat` file
4. **Response**: `Bun.file()` streams the built file back to client

### Key Patterns

**Async Build Process**: The `mapeo-settings-builder` command runs asynchronously. The service polls the build directory waiting for the `.comapeocat` file to appear rather than blocking on command completion.

**Temporary Directory Management**: Each request creates a unique temp directory using `os.tmpdir()` with prefix `comapeo-settings-`. Cleanup is currently commented out in `settingsBuilder.ts:58` but should be enabled for production.

**Error Handling**: Controller catches errors and returns 500 responses with error messages. No custom error types or middleware are currently in use.

### File Structure

```
src/
├── app.ts                    # Elysia app factory
├── index.ts                  # Entry point, starts server
├── config/app.ts             # Configuration constants (port, timeouts, etc.)
├── controllers/
│   ├── settingsController.ts # File upload handler
│   └── healthController.ts   # Health check endpoint
├── services/
│   └── settingsBuilder.ts    # Core build logic
├── utils/
│   ├── shell.ts              # Shell command execution helpers
│   └── errorHelpers.ts       # Error utilities
├── middleware/
│   ├── logger.ts             # Request logging
│   └── errorHandler.ts       # Error handling middleware
└── tests/
    ├── unit/                 # Unit tests for all modules
    └── integration/          # Integration tests with test server
```

## Docker

The project uses a multi-stage Docker setup:

- Base image: `node:18-bullseye-slim` (not official Bun image due to `mapnik` native dependencies)
- Installs Bun v1.0.16 globally
- Installs `mapeo-settings-builder` globally
- Exposes port 3000
- Entry point: `bun run index.ts`

**Build and run locally**:
```bash
docker build -t comapeo-config-builder-api:local .
docker run -p 3000:3000 comapeo-config-builder-api:local
```

## Testing Strategy

- **Unit tests**: Mock external dependencies (shell commands, file system)
- **Integration tests**: Use `test-server.ts` to spin up real Elysia instance
- **Test environment**: Set via `BUN_ENV=test` in package.json scripts
- **Test helpers**: Shared utilities in `src/tests/utils/testHelpers.ts`

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

- **deploy.yml**: Builds Docker image, runs tests, deploys to GitHub Container Registry
- **docker-test.yml**: Tests the Docker image with real API requests
- **fly-deploy.yml**: Legacy Fly.io deployment (may be deprecated)

## API Usage

```bash
# Upload a ZIP file and receive a .comapeocat file
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@config.zip" \
  --output output.comapeocat \
  http://localhost:3000/
```

## Important Notes

- The `mapeo-settings-builder` CLI must be installed globally in the execution environment
- Input ZIP must contain a `metadata.json` file with `name` and `version` fields
- Build process is asynchronous and uses polling with configurable timeout (default: 120s)
- CORS is enabled via `@elysiajs/cors`
- TypeScript is configured for strict mode with ESNext target
