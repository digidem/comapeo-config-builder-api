# Architecture Overview

## System Architecture

The CoMapeo Config Builder API is a REST API built with Bun runtime and Elysia web framework. It provides a simple, focused service for processing CoMapeo configuration ZIP files and building `.comapeocat` files using the `mapeo-settings-builder` CLI tool.

### High-Level Flow

```
Client → POST /
  ↓
Controller (settingsController.ts)
  ↓
Service (settingsBuilder.ts)
  ↓
Shell Command (mapeo-settings-builder CLI)
  ↓
Response (.comapeocat file)
```

## Project Structure

```
comapeo-config-builder-api/
├── src/
│   ├── index.ts                    # Entry point - starts server
│   ├── app.ts                      # Elysia app factory
│   ├── config/
│   │   └── app.ts                  # Configuration constants
│   ├── controllers/
│   │   ├── settingsController.ts   # Main build endpoint handler
│   │   └── healthController.ts     # Health check endpoint
│   ├── services/
│   │   └── settingsBuilder.ts      # Core build orchestration
│   ├── middleware/
│   │   ├── logger.ts               # Request logging
│   │   └── errorHandler.ts         # Error handling
│   ├── utils/
│   │   ├── shell.ts                # Shell command execution
│   │   └── errorHelpers.ts         # Error utilities
│   ├── types/
│   │   └── errors.ts               # Custom error types
│   └── tests/
│       ├── unit/                   # Unit tests
│       ├── integration/            # Integration tests
│       └── utils/                  # Test utilities
├── scripts/                        # Test scripts
├── Dockerfile                      # Docker container configuration
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
└── index.ts                        # Re-export for backward compatibility
```

## Core Components

### 1. Application Entry (`src/index.ts`)

- Imports and initializes the Elysia app
- Starts the server on configured port (default: 3000)
- Minimal startup logic, delegates to `createApp()`

**Location**: `src/index.ts`

### 2. Application Factory (`src/app.ts`)

- Creates and configures the Elysia application instance
- Registers CORS middleware
- Defines routes:
  - `GET /health` - Health check endpoint
  - `POST /` - Main build endpoint
- Returns configured app instance

**Location**: `src/app.ts`

### 3. Controllers Layer

Controllers handle HTTP requests and responses:

- **settingsController** (`src/controllers/settingsController.ts`):
  - Handles file upload validation
  - Converts File to ArrayBuffer
  - Calls `buildSettings()` service
  - Returns built file or error response

- **healthController** (`src/controllers/healthController.ts`):
  - Returns health status
  - Includes version and timestamp
  - Used for monitoring and readiness checks

### 4. Services Layer

**settingsBuilder** (`src/services/settingsBuilder.ts`):

Core business logic that:
1. Creates temporary directory using `fs.mkdtemp()`
2. Extracts ZIP file using `adm-zip`
3. Reads `metadata.json` to determine output filename
4. Spawns `mapeo-settings-builder build` command
5. Polls for output file (max 120 attempts, 1s intervals)
6. Returns path to built `.comapeocat` file

**Key Pattern**: Asynchronous build process with polling. The CLI command runs in background while the service polls for the output file.

### 5. Utilities

- **shell.ts** (`src/utils/shell.ts`):
  - Wraps Node.js `exec()` for shell command execution
  - Provides `runShellCommand()` function
  - Handles stdout/stderr logging

- **errorHelpers.ts** (`src/utils/errorHelpers.ts`):
  - Safe error message extraction
  - Type-safe error handling utilities

### 6. Middleware

- **logger** (`src/middleware/logger.ts`):
  - Generates unique request IDs
  - Logs request start/completion
  - Tracks request duration
  - Uses Elysia's `derive()` for context injection

- **errorHandler** (`src/middleware/errorHandler.ts`):
  - Standardizes error responses
  - Maps error types to HTTP status codes:
    - `ValidationError` → 400
    - `NotFoundError` → 404
    - `ParseError` → 400
    - `ProcessingError` → 422
    - Default → 500
  - Returns JSON error responses

### 7. Type Definitions

**Custom Error Types** (`src/types/errors.ts`):
- `ValidationError` - Input validation failures
- `ProcessingError` - Processing/build failures

## Data Flow

### Request Processing Flow

1. **Client uploads ZIP file** to `POST /`
2. **Elysia receives request**, validates file presence
3. **Controller** (`handleBuildSettings`):
   - Validates file exists
   - Converts File to ArrayBuffer
   - Calls service layer
4. **Service** (`buildSettings`):
   - Creates temp directory: `/tmp/comapeo-settings-XXXXXX`
   - Extracts ZIP contents to temp directory
   - Reads metadata.json for output filename
   - Creates build directory: `{tempDir}/build/`
   - Spawns shell command: `mapeo-settings-builder build {configPath} -o {buildPath}`
   - Polls for output file:
     - Max attempts: 120 (2 minutes)
     - Delay: 1000ms between attempts
     - Checks file existence and size > 0
   - Returns path to built file
5. **Controller returns** built file using `Bun.file()`
6. **Client receives** `.comapeocat` file

### Error Flow

1. Error occurs in service or controller
2. Error caught by try/catch in controller
3. Error logged to console
4. JSON error response returned with:
   - Status code (400, 404, 422, 500)
   - Error message
   - Status field

## Design Patterns

### 1. Factory Pattern
- `createApp()` factory function for app instantiation
- Enables testing by creating isolated app instances

### 2. Asynchronous Processing with Polling
- Build command runs asynchronously
- Service polls for output file rather than blocking
- Configurable timeout and retry logic

### 3. Temporary Resource Management
- Each request gets unique temp directory
- Cleanup commented out but structure supports it
- Uses OS temp directory with unique prefix

### 4. Middleware Pipeline
- CORS enabled globally
- Logger derives context for all routes
- Error handler standardizes responses

## Runtime Environment

- **Runtime**: Bun (pinned to v1.0.16)
- **Framework**: Elysia (Bun-native web framework)
- **Language**: TypeScript with strict mode
- **Module System**: ESNext modules

## Key Architectural Decisions

1. **Bun over Node.js**: Faster runtime, built-in TypeScript support
2. **Elysia over Express**: Bun-native, better performance, type safety
3. **Polling over Event Watching**: Simpler, more reliable across platforms
4. **Temporary Directory per Request**: Isolation, prevents conflicts
5. **CLI Tool Integration**: Leverages existing `mapeo-settings-builder` rather than reimplementing
6. **No Database**: Stateless API, no persistent storage needed
7. **Docker Deployment**: Uses Node base image for native dependency support (mapnik)
