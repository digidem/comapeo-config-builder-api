# Dependencies and External Integrations

## Runtime Dependencies

### Primary Dependencies

#### Elysia
- **Version**: `^1.2.25`
- **Purpose**: Bun-native web framework
- **Usage**: Core HTTP server and routing
- **Key Features**:
  - Fast performance optimized for Bun
  - Type-safe request/response handling
  - Built-in validation with TypeBox
  - Plugin system
- **Files Using**:
  - `src/app.ts` - App creation and route definitions
  - `src/index.ts` - Server initialization
  - `src/middleware/logger.ts` - Middleware integration
  - `src/controllers/healthController.ts` - Controller patterns

**Example Usage**:
```typescript
import { Elysia } from 'elysia';

const app = new Elysia()
  .get('/health', () => ({ status: 'ok' }))
  .post('/', handler);
```

---

#### @elysiajs/cors
- **Version**: `^1.2.0`
- **Purpose**: CORS middleware for Elysia
- **Usage**: Enable cross-origin requests
- **Configuration**: Currently allows all origins
- **Files Using**: `src/app.ts:10`

**Example Usage**:
```typescript
import { cors } from "@elysiajs/cors";

const app = new Elysia().use(cors());
```

---

#### adm-zip
- **Version**: `^0.5.16`
- **Purpose**: ZIP file manipulation
- **Usage**:
  - Extract uploaded ZIP files
  - Read ZIP contents
- **Files Using**:
  - `src/services/settingsBuilder.ts` - ZIP extraction
  - `src/tests/utils/testHelpers.ts` - Test ZIP creation

**Example Usage**:
```typescript
import AdmZip from 'adm-zip';

const zip = new AdmZip(buffer);
zip.extractAllTo(targetDir, true);
```

**Key Methods Used**:
- `extractAllTo(path, overwrite)` - Extract all files
- `addLocalFile(path)` - Add file to ZIP (tests only)
- `writeZip(path)` - Write ZIP to disk (tests only)

---

#### mapeo-settings-builder
- **Version**: `^6.0.0`
- **Purpose**: CLI tool for building CoMapeo configuration files
- **Type**: Global CLI installation
- **Usage**: Invoked via shell command
- **Installation**: `npm install -g mapeo-settings-builder`
- **Files Using**: `src/services/settingsBuilder.ts:32`

**Command Format**:
```bash
mapeo-settings-builder build <input-dir> -o <output-path>
```

**Integration Pattern**:
- Invoked via `runShellCommand()` utility
- Runs asynchronously (fire-and-forget)
- Output file detected via polling

**Documentation**: https://github.com/digidem/mapeo-settings-builder

---

### Development Dependencies

#### @types/bun
- **Version**: `latest`
- **Purpose**: TypeScript definitions for Bun runtime
- **Usage**: Bun API type definitions

#### bun-types
- **Version**: `latest`
- **Purpose**: Additional Bun type definitions
- **Usage**: Bun-specific TypeScript types

#### @types/adm-zip
- **Version**: `^0.5.7`
- **Purpose**: TypeScript definitions for adm-zip
- **Usage**: Type safety for ZIP operations

#### biome
- **Version**: `^0.3.3`
- **Purpose**: Linter and formatter
- **Usage**: Code quality and style enforcement
- **Command**: `bun run lint`

---

### Peer Dependencies

#### TypeScript
- **Version**: `^5.6.3`
- **Purpose**: TypeScript compiler
- **Usage**: Type checking and compilation
- **Configuration**: `tsconfig.json`

---

## Dependency Overrides

**Location**: `package.json:30-41`

The following packages have version overrides for security reasons:

```json
{
  "resolutions": {
    "cross-spawn": "^7.0.5",
    "lodash": "^4.17.21",
    "nth-check": "^2.0.1",
    "ws": "^8.17.1"
  },
  "overrides": {
    "cross-spawn": "^7.0.5",
    "lodash": "^4.17.21",
    "nth-check": "^2.0.1",
    "ws": "^8.17.1"
  }
}
```

### Purpose of Overrides

- **cross-spawn**: Security patch for command injection vulnerabilities
- **lodash**: Security patch for prototype pollution
- **nth-check**: Security patch for ReDoS vulnerabilities
- **ws**: Security patch for denial of service vulnerabilities

**Note**: Both `resolutions` (Yarn) and `overrides` (npm/Bun) are specified for compatibility.

---

## Node.js Built-in Modules

### File System (`fs/promises`)
- **Usage**: Asynchronous file operations
- **Key Functions**:
  - `mkdtemp()` - Create temporary directory
  - `readFile()` - Read file contents
  - `writeFile()` - Write file contents
  - `mkdir()` - Create directory
  - `stat()` - Get file statistics
  - `rm()` - Remove files/directories
  - `unlink()` - Delete file
  - `access()` - Check file existence

**Files Using**:
- `src/services/settingsBuilder.ts`
- `src/tests/utils/testHelpers.ts`

---

### Path (`path`)
- **Usage**: Path manipulation
- **Key Functions**:
  - `join()` - Join path segments
  - `basename()` - Get filename from path

**Files Using**:
- `src/services/settingsBuilder.ts`
- `src/tests/utils/testHelpers.ts`

---

### OS (`os`)
- **Usage**: Operating system utilities
- **Key Functions**:
  - `tmpdir()` - Get system temp directory

**Files Using**:
- `src/services/settingsBuilder.ts`
- `src/tests/utils/testHelpers.ts`

---

### Child Process (`child_process`)
- **Usage**: Execute shell commands
- **Key Functions**:
  - `exec()` - Execute command in shell
  - `promisify()` - Convert callback to Promise

**Files Using**:
- `src/utils/shell.ts`

---

### Util (`util`)
- **Usage**: Utility functions
- **Key Functions**:
  - `promisify()` - Convert callback-based functions to Promises

**Files Using**:
- `src/utils/shell.ts`

---

### Crypto (`crypto`)
- **Usage**: Cryptographic functions
- **Key Functions**:
  - `randomUUID()` - Generate random UUIDs for request IDs

**Files Using**:
- `src/middleware/logger.ts`

---

## External CLI Tools

### mapeo-settings-builder CLI
- **Installation**: Global npm package
- **Version**: `^6.0.0`
- **Purpose**: Process CoMapeo configuration files
- **Invocation**: Shell command via `child_process.exec()`

**Command Format**:
```bash
mapeo-settings-builder build <input> -o <output>
```

**Arguments**:
- `<input>`: Path to configuration directory
- `-o <output>`: Output path for `.comapeocat` file

**Behavior**:
- Reads configuration files from input directory
- Validates configuration structure
- Processes assets (icons, images)
- Builds `.comapeocat` file (ZIP format)
- Outputs to specified path

**Required Input Structure**:
- `metadata.json` - Required metadata file
- `presets/` - Optional preset definitions
- `fields/` - Optional field definitions
- `icons/` - Optional icon assets

---

## Bun Runtime

### Bun Version
- **Version**: `1.0.16` (pinned)
- **Reason**: Stability and compatibility with mapeo-settings-builder
- **Installation**: `npm install -g bun@1.0.16`

### Bun APIs Used

#### `Bun.file()`
- **Purpose**: Stream files efficiently
- **Usage**: Return built `.comapeocat` file to client
- **Files Using**: `src/controllers/settingsController.ts:19`

**Example**:
```typescript
return Bun.file(filePath);
```

#### `bun test`
- **Purpose**: Built-in test runner
- **Usage**: Run unit and integration tests
- **Configuration**: Environment variable `BUN_ENV=test`

**Commands**:
```bash
bun test                    # Run all tests
bun test src/tests/unit     # Run unit tests only
bun test file.test.ts       # Run specific test file
```

---

## Docker Base Image

### node:18-bullseye-slim
- **Purpose**: Base image for Docker container
- **Reason**: Required for native dependencies (mapnik)
- **Alternative**: Official Bun image doesn't support mapnik dependencies

**Dependencies Installed**:
```dockerfile
RUN apt-get update && apt-get install -yq \
  gconf-service libasound2 libatk1.0-0 libc6 libcairo2 \
  libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 \
  libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 \
  libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
  libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 \
  libxrender1 libxss1 libxtst6 ca-certificates \
  fonts-liberation libnss3 lsb-release xdg-utils wget bzip2
```

**Purpose**: Support native modules used by mapeo-settings-builder

---

## Dependency Management

### Installation

**Local Development**:
```bash
bun install
```

**Docker Build**:
```bash
# In Dockerfile
RUN bun install
```

### Auditing

**Check for vulnerabilities**:
```bash
bun run audit
# Or
npm audit --production
```

### Updating Dependencies

**Update specific package**:
```bash
bun update elysia
```

**Update all dependencies**:
```bash
bun update
```

**Check outdated packages**:
```bash
bun outdated
```

---

## Dependency Graph

```
Application
├── Runtime
│   └── Bun 1.0.16
│       ├── Built-in APIs (Bun.file)
│       └── Test Runner
├── Web Framework
│   ├── elysia (HTTP server, routing)
│   └── @elysiajs/cors (CORS middleware)
├── File Processing
│   └── adm-zip (ZIP extraction/creation)
├── External CLI
│   └── mapeo-settings-builder (Config building)
├── Node.js Built-ins
│   ├── fs/promises (File operations)
│   ├── path (Path utilities)
│   ├── os (System info)
│   ├── child_process (Shell commands)
│   ├── util (Utilities)
│   └── crypto (UUID generation)
└── Development
    ├── TypeScript (Type checking)
    ├── @types/* (Type definitions)
    └── biome (Linting)
```

---

## Security Considerations

### Known Vulnerabilities
- Addressed via dependency overrides
- Regular audits via `npm audit`

### Best Practices
1. Pin critical dependencies (Bun version)
2. Use dependency overrides for security patches
3. Regular dependency audits
4. Minimize dependency tree
5. Prefer well-maintained packages

### Supply Chain Security
- All dependencies from npm registry
- Lock file (`bun.lockb`) ensures reproducible builds
- Docker image uses official Node.js base image
- Global CLI tool (mapeo-settings-builder) from trusted source

---

## Future Dependency Considerations

### Potential Additions
1. **Authentication**: JWT library (e.g., `jose`)
2. **Rate Limiting**: `@elysiajs/rate-limit`
3. **Validation**: Enhanced validation beyond Elysia built-in
4. **Monitoring**: APM/telemetry libraries
5. **Database**: If persistence is needed (e.g., SQLite, PostgreSQL)
6. **Caching**: Redis client if caching is implemented

### Migration Considerations
- **Bun Version Upgrade**: Test thoroughly with mapeo-settings-builder
- **Elysia Version**: Monitor breaking changes in v2+
- **Node.js Built-ins**: Consider Bun-native alternatives when stable
