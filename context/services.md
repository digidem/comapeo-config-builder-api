# Services and Business Logic

## Overview

The application has a single core service that handles the main business logic of processing CoMapeo configuration files. Additional utility modules provide supporting functionality.

---

## Core Service: Settings Builder

**Location**: `src/services/settingsBuilder.ts`

### Purpose

Orchestrates the entire build process for converting a ZIP file containing CoMapeo configuration into a `.comapeocat` file.

### Main Function: `buildSettings()`

```typescript
async function buildSettings(fileBuffer: ArrayBuffer): Promise<string>
```

**Parameters**:
- `fileBuffer` (ArrayBuffer): The uploaded ZIP file contents

**Returns**:
- Promise<string>: Path to the built `.comapeocat` file

**Throws**:
- Error if metadata.json is missing or invalid
- Error if build process fails or times out

### Processing Steps

#### 1. Create Temporary Directory

```typescript
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), config.tempDirPrefix));
```

- Uses Node.js `fs.mkdtemp()` for unique directory creation
- Prefix: `comapeo-settings-` (from config)
- Location: OS temp directory (e.g., `/tmp/`)
- Example: `/tmp/comapeo-settings-abc123/`

#### 2. Extract ZIP File

```typescript
const zip = new AdmZip(Buffer.from(fileBuffer));
zip.extractAllTo(tmpDir, true);
```

- Converts ArrayBuffer to Buffer
- Extracts all contents to temp directory
- Overwrites existing files (second parameter: true)
- Preserves directory structure from ZIP

#### 3. Read Metadata

```typescript
const metadata = JSON.parse(
  await fs.readFile(path.join(fullConfigPath, 'metadata.json'), 'utf-8')
);
const buildFileName = `${metadata.name}-${metadata.version}.comapeocat`;
```

- Reads `metadata.json` from extracted files
- Parses JSON to get name and version
- Constructs output filename: `{name}-{version}.comapeocat`

**Required metadata fields**:
- `name`: Configuration name (string)
- `version`: Configuration version (string)

#### 4. Prepare Build Directory

```typescript
const buildDir = path.join(fullConfigPath, 'build');
await fs.mkdir(buildDir, { recursive: true });
```

- Creates `build/` subdirectory in temp location
- `recursive: true` ensures parent directories exist

#### 5. Execute Build Command

```typescript
runShellCommand(`mapeo-settings-builder build ${fullConfigPath} -o ${buildPath}`);
```

- Spawns `mapeo-settings-builder` CLI in background
- Command format: `mapeo-settings-builder build <input> -o <output>`
- Does NOT wait for command completion (fire-and-forget)
- Command runs asynchronously while service polls for output

**Note**: The command is not awaited. This is intentional - the service uses polling instead.

#### 6. Poll for Output File

```typescript
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  try {
    const fileStats = await fs.stat(buildPath);
    if (fileStats.isFile() && fileStats.size > 0) {
      builtSettingsPath = buildPath;
      break;
    }
  } catch (error) {
    // File doesn't exist yet, continue waiting
  }
  await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
}
```

**Polling Configuration** (from `config.ts`):
- Max attempts: 120 (configurable via `config.maxAttempts`)
- Delay between attempts: 1000ms (configurable via `config.delayBetweenAttempts`)
- Total max wait time: 120 seconds

**Polling Logic**:
1. Attempt to stat the expected output file
2. Check if it's a file (not directory)
3. Check if size > 0 (file has content)
4. If successful, break loop
5. If file doesn't exist, catch error and continue
6. Wait 1 second before next attempt

**Timeout Behavior**:
- If file not found after 120 attempts, throw error
- Error message: "No .comapeocat file found in the build directory after waiting"

#### 7. Cleanup (Currently Disabled)

```typescript
// Clean up the temporary directory (uncomment when ready)
// await fs.rm(tmpDir, { recursive: true, force: true });
```

**Current State**: Cleanup is commented out
**Reason**: Useful for debugging, prevents premature deletion
**Production**: Should be uncommented to prevent temp directory accumulation

**Implementation Note**:
- `recursive: true`: Delete directory and all contents
- `force: true`: Don't throw error if path doesn't exist

#### 8. Return File Path

```typescript
return builtSettingsPath;
```

Returns absolute path to the built `.comapeocat` file, which is then streamed by the controller.

---

## Utility Modules

### Shell Command Execution

**Location**: `src/utils/shell.ts`

#### `runShellCommand()`

```typescript
function runShellCommand(command: string): Promise<string>
```

**Purpose**: Execute shell commands and capture output

**Implementation**:
- Wraps Node.js `child_process.exec()`
- Returns Promise that resolves with stdout
- Logs stderr to console
- Rejects on command execution errors

**Error Handling**:
- Logs execution failures to console
- Logs stderr output separately
- Rejects Promise with error object

**Usage Example**:
```typescript
await runShellCommand('mapeo-settings-builder build /path/to/config -o /path/to/output');
```

**Important Note**: In the current codebase, this function is called without `await` in `settingsBuilder.ts`, making it fire-and-forget.

#### `execAsync`

```typescript
const execAsync = promisify(exec);
```

Promisified version of `exec()` for alternative usage patterns.

---

### Error Helpers

**Location**: `src/utils/errorHelpers.ts`

#### `getErrorMessage()`

```typescript
function getErrorMessage(error: unknown): string
```

**Purpose**: Safely extract error messages from unknown error types

**Logic**:
1. Check if error is instance of Error
2. If yes, return `error.message`
3. If no, convert to string with `String(error)`

**Use Case**: Type-safe error handling in catch blocks

**Example**:
```typescript
try {
  await riskyOperation();
} catch (error) {
  const message = getErrorMessage(error);
  console.error(`Operation failed: ${message}`);
}
```

---

## Custom Error Types

**Location**: `src/types/errors.ts`

### `ValidationError`

```typescript
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

**Purpose**: Indicates input validation failures
**HTTP Status**: 400 Bad Request
**Usage**: Thrown when client provides invalid data

### `ProcessingError`

```typescript
class ProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessingError';
  }
}
```

**Purpose**: Indicates processing or build failures
**HTTP Status**: 422 Unprocessable Entity
**Usage**: Thrown when valid input cannot be processed

**Current Usage**: Defined but not actively used in current codebase. Controllers throw generic Error instead.

---

## Service Design Patterns

### 1. Asynchronous Processing with Polling

**Why**: The `mapeo-settings-builder` CLI runs asynchronously. Rather than blocking on command completion, the service polls for output.

**Advantages**:
- Decouples from CLI execution time
- Handles variable processing times
- Simple to implement and understand

**Trade-offs**:
- CPU cycles spent polling
- Fixed polling interval may be suboptimal
- Timeout must be configured appropriately

### 2. Temporary Resource Isolation

**Pattern**: Each request gets its own temporary directory

**Advantages**:
- No conflicts between concurrent requests
- Clean separation of request data
- Easy cleanup (when enabled)

**Implementation**:
- Uses `fs.mkdtemp()` for guaranteed unique directories
- Prefix-based naming for easy identification

### 3. Fire-and-Forget Command Execution

**Pattern**: Shell command is not awaited

**Why**: The CLI tool runs asynchronously and may take variable time. Polling for output is more reliable than waiting for command completion.

**Alternative Approaches** (not implemented):
- Await command completion (blocked by variable execution time)
- Event-based file watching (more complex, platform-dependent)
- Message queue (overkill for single-service architecture)

---

## Key Dependencies Used

### From Node.js

- `fs/promises`: File system operations (async)
- `path`: Path manipulation
- `os`: OS-level utilities (temp directory)
- `child_process`: Shell command execution

### From npm

- `adm-zip`: ZIP file extraction and creation
- Elysia's `Bun.file()`: File streaming (used in controller)

---

## Configuration Integration

The service uses configuration from `src/config/app.ts`:

```typescript
{
  tempDirPrefix: 'comapeo-settings-',      // Temp directory prefix
  maxAttempts: 120,                         // Polling max attempts
  delayBetweenAttempts: 1000                // Polling delay (ms)
}
```

See `context/config.md` for full configuration details.

---

## Future Improvements

### Potential Enhancements

1. **Enable Cleanup**: Uncomment temp directory cleanup
2. **Better Error Types**: Use custom error types consistently
3. **Streaming Processing**: Stream ZIP extraction for large files
4. **Progress Callbacks**: Report build progress to client
5. **File Watching**: Replace polling with inotify/fs.watch
6. **Validation**: Pre-validate ZIP structure before processing
7. **Metrics**: Add timing and success/failure metrics
8. **Retry Logic**: Retry failed builds with exponential backoff
9. **Resource Limits**: Add file size limits and timeout controls
10. **Parallel Processing**: Support batch processing of multiple files
