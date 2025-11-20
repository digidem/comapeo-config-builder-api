# Testing Documentation

## Testing Overview

The project uses **Bun's built-in test runner** for all testing. The test suite includes comprehensive unit tests and integration tests to ensure reliability and correctness.

### Test Organization

```
src/tests/
├── unit/                           # Unit tests
│   ├── config/
│   │   └── app.test.ts            # Configuration tests
│   ├── controllers/
│   │   ├── healthController.test.ts
│   │   └── settingsController.test.ts
│   ├── middleware/
│   │   ├── errorHandler.test.ts
│   │   └── logger.test.ts
│   ├── services/
│   │   ├── settingsBuilder.simple.test.ts
│   │   ├── settingsBuilder.cleanup.test.ts
│   │   └── settingsBuilder.build.test.ts
│   ├── types/
│   │   └── errors.test.ts
│   ├── utils/
│   │   └── shell.test.ts
│   └── simple.test.ts
├── integration/                    # Integration tests
│   ├── test-server.ts             # Test server for integration tests
│   └── simple-server.ts           # Simple integration test
└── utils/
    └── testHelpers.ts             # Shared test utilities
```

---

## Test Commands

### Run All Tests
```bash
bun test
```

### Run Unit Tests Only
```bash
bun run test:unit
# or
bun test src/tests/unit
```

### Run Integration Tests Only
```bash
bun run test:integration
# or
bun test src/tests/integration
```

### Run Specific Test File
```bash
bun test src/tests/unit/utils/shell.test.ts
```

### Run Tests with Coverage
```bash
bun test --coverage
```

---

## Test Environment

### Environment Variable
All test scripts set `BUN_ENV=test`:

```json
{
  "scripts": {
    "test": "BUN_ENV=test bun test src/tests",
    "test:unit": "BUN_ENV=test bun test src/tests/unit",
    "test:integration": "BUN_ENV=test bun test src/tests/integration"
  }
}
```

**Purpose**: Distinguish test environment from development/production

---

## Testing Framework

### Bun Test API

The project uses Bun's built-in testing functions:

```typescript
import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from 'bun:test';
```

#### Key Functions

- **`describe(name, fn)`**: Group related tests
- **`it(name, fn)`**: Define individual test case
- **`expect(value)`**: Assertion API
- **`mock(implementation)`**: Create mock functions
- **`spyOn(object, method)`**: Spy on existing methods
- **`beforeEach(fn)`**: Run before each test
- **`afterEach(fn)`**: Run after each test

---

## Test Utilities

**Location**: `src/tests/utils/testHelpers.ts`

### `createTempFile()`

```typescript
async function createTempFile(content: string, extension = '.txt'): Promise<string>
```

**Purpose**: Create temporary test files

**Usage**:
```typescript
const filePath = await createTempFile('test content', '.json');
// Use file
await cleanup(filePath);
```

---

### `createTestZip()`

```typescript
async function createTestZip(metadata: any = { name: 'test', version: '1.0.0' }): Promise<string>
```

**Purpose**: Create test ZIP files with metadata.json

**Usage**:
```typescript
const zipPath = await createTestZip({ name: 'my-config', version: '2.0.0' });
// Use ZIP file
await cleanup(zipPath);
```

**Creates**:
- Temporary directory
- `metadata.json` file with provided data
- ZIP archive containing metadata.json

---

### `cleanup()`

```typescript
async function cleanup(...paths: string[]): Promise<void>
```

**Purpose**: Clean up temporary test files and directories

**Features**:
- Handles files and directories
- Gracefully handles missing paths
- Tries multiple deletion methods
- Logs cleanup failures

**Usage**:
```typescript
const file1 = await createTempFile('test');
const file2 = await createTempFile('test2');
// ... tests ...
await cleanup(file1, file2);
```

---

### `mockBunFile()`

```typescript
function mockBunFile(filePath: string): File
```

**Purpose**: Create mock File objects for testing

**Usage**:
```typescript
const mockFile = mockBunFile('/path/to/test.zip');
```

---

### `createTestApp()`

```typescript
function createTestApp(app: Elysia)
```

**Purpose**: Create test app instances

**Usage**:
```typescript
const app = createApp();
const testApp = createTestApp(app);
```

---

## Unit Test Patterns

### Mocking External Dependencies

**Example**: `src/tests/unit/services/settingsBuilder.simple.test.ts`

```typescript
import { describe, it, expect, spyOn, beforeEach } from 'bun:test';
import { buildSettings } from '../../../services/settingsBuilder';
import fs from 'fs/promises';

describe('SettingsBuilder - Build Tests', () => {
  beforeEach(() => {
    // Mock file system operations
    spyOn(fs, 'mkdtemp').mockResolvedValue('/tmp/comapeo-settings-test-123456');
    spyOn(fs, 'rm').mockResolvedValue(undefined);
  });

  it('should export buildSettings function', () => {
    expect(typeof buildSettings).toBe('function');
  });
});
```

**Key Pattern**: Use `spyOn()` to mock Node.js built-in modules

---

### Testing Controllers

**Example Pattern**:
```typescript
describe('SettingsController', () => {
  it('should handle missing file', async () => {
    const result = await handleBuildSettings(null as any);
    // Assert error response
  });

  it('should process valid file', async () => {
    const mockFile = new File(['content'], 'test.zip');
    const result = await handleBuildSettings(mockFile);
    // Assert success
  });
});
```

---

### Testing Middleware

**Example Pattern**:
```typescript
describe('Logger Middleware', () => {
  it('should generate request ID', () => {
    const app = new Elysia().use(logger);
    // Test request ID generation
  });

  it('should log request duration', () => {
    // Test timing functionality
  });
});
```

---

### Testing Error Handlers

**Example Pattern**:
```typescript
describe('Error Handler', () => {
  it('should handle ValidationError', () => {
    const error = new ValidationError('Invalid input');
    const response = errorHandler(error);
    expect(response.status).toBe(400);
  });

  it('should handle unknown errors', () => {
    const error = new Error('Unknown error');
    const response = errorHandler(error);
    expect(response.status).toBe(500);
  });
});
```

---

## Integration Tests

### Test Server

**Location**: `src/tests/integration/test-server.ts`

```typescript
import { createApp } from '../../app';

const app = createApp();
const server = app.listen(3001);

console.log('Test server started on http://localhost:3001');
```

**Purpose**:
- Start real server for integration testing
- Uses port 3001 to avoid conflicts
- Can be started manually for testing

**Usage**:
```bash
bun run src/tests/integration/test-server.ts
```

---

### Integration Test Pattern

**Typical Structure**:
1. Start test server (or use running server)
2. Make HTTP requests to endpoints
3. Validate responses
4. Check side effects (files created, etc.)
5. Clean up resources

**Example**:
```typescript
describe('Integration Tests', () => {
  let server;

  beforeEach(() => {
    const app = createApp();
    server = app.listen(3001);
  });

  afterEach(() => {
    server.stop();
  });

  it('should process ZIP file end-to-end', async () => {
    const zipPath = await createTestZip();
    const zipBuffer = await fs.readFile(zipPath);

    const response = await fetch('http://localhost:3001/', {
      method: 'POST',
      body: createFormData(zipBuffer)
    });

    expect(response.status).toBe(200);
    // Validate response

    await cleanup(zipPath);
  });
});
```

---

## Shell Script Tests

### Test API Script

**Location**: `scripts/test-api.sh`

**Purpose**: End-to-end API testing with real HTTP requests

**Features**:
1. Check API health endpoint
2. Upload ZIP file
3. Verify response status code
4. Validate `.comapeocat` file format
5. Extract and list contents

**Usage**:
```bash
# Default settings
./scripts/test-api.sh

# Custom settings
./scripts/test-api.sh \
  --url http://localhost:3000 \
  --file my-config.zip \
  --output result.comapeocat
```

**Test Flow**:
```bash
# 1. Check health
curl http://localhost:3000/health

# 2. Upload file
curl -X POST -F "file=@config.zip" http://localhost:3000/ -o output.comapeocat

# 3. Verify response
if [[ $response == "200" ]]; then
  # 4. Validate ZIP format
  unzip -t output.comapeocat

  # 5. List contents
  unzip -l output.comapeocat
fi
```

---

### Docker Test Script

**Location**: `scripts/test-mapeo-config.sh`

**Purpose**: Test Docker image with real API requests

**Used In**: GitHub Actions workflow (`.github/workflows/docker-test.yml`)

---

## Test Coverage

### Covered Areas

✅ **Controllers**
- Health check endpoint
- Settings controller (file upload, error handling)

✅ **Services**
- Settings builder (build process, cleanup, errors)

✅ **Middleware**
- Logger (request ID, timing)
- Error handler (all error types)

✅ **Utilities**
- Shell command execution
- Error helpers

✅ **Configuration**
- Config object structure
- Environment variable parsing

✅ **Types**
- Custom error types

✅ **Integration**
- End-to-end API flow
- Docker container testing

---

### Coverage Gaps

⚠️ **Partial Coverage**:
- Full integration tests with real `mapeo-settings-builder` CLI
- Large file handling
- Concurrent request handling
- Timeout scenarios

⚠️ **Not Covered**:
- Performance testing
- Load testing
- Security testing (authentication, rate limiting)
- Edge cases in ZIP extraction

---

## Mocking Strategy

### What Gets Mocked

1. **File System Operations**
   - `fs.mkdtemp()` - Return fake temp directory
   - `fs.readFile()` - Return test data
   - `fs.writeFile()` - No-op
   - `fs.rm()` - No-op
   - `fs.stat()` - Return mock file stats

2. **Shell Commands**
   - `exec()` - Return mock stdout/stderr
   - Avoid actually invoking `mapeo-settings-builder`

3. **External Services**
   - No external services currently (stateless API)

### What Doesn't Get Mocked

1. **Integration Tests**
   - Real Elysia app instance
   - Real HTTP requests
   - Real file system operations (in isolated temp directories)

2. **Utility Functions**
   - Simple pure functions tested directly
   - Error helpers tested with real Error objects

---

## Testing Best Practices

### 1. Isolation
- Each test is independent
- Use `beforeEach()` to reset state
- Clean up resources in `afterEach()` or test end

### 2. Descriptive Names
```typescript
// Good
it('should return 400 when file is missing')

// Bad
it('test file error')
```

### 3. AAA Pattern
```typescript
it('should process valid file', async () => {
  // Arrange
  const mockFile = createMockFile();

  // Act
  const result = await processFile(mockFile);

  // Assert
  expect(result).toBeDefined();
});
```

### 4. Mock External Dependencies
- Mock file system operations in unit tests
- Mock shell commands
- Use real implementations only in integration tests

### 5. Test Error Cases
```typescript
describe('Error Scenarios', () => {
  it('should handle missing metadata.json');
  it('should handle invalid ZIP format');
  it('should handle build timeout');
  it('should handle build failure');
});
```

---

## Running Tests in CI/CD

### GitHub Actions Workflow

**Location**: `.github/workflows/deploy.yml`

```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v1
      with:
        bun-version: latest
    - run: bun install
    - run: bun tsc --noEmit      # Type checking
    - run: bun test              # Run all tests
    - run: bun run lint          # Linting
```

**Test Order**:
1. Type checking
2. Unit and integration tests
3. Linting
4. Docker build (only after tests pass)

---

## Debugging Tests

### Run Single Test
```bash
bun test src/tests/unit/utils/shell.test.ts
```

### Add Debug Output
```typescript
it('should process file', async () => {
  console.log('Debug: Starting test');
  const result = await processFile(mockFile);
  console.log('Debug: Result:', result);
  expect(result).toBeDefined();
});
```

### Use Bun Debugger
```bash
bun --inspect test src/tests/unit/services/settingsBuilder.test.ts
```

---

## Future Testing Improvements

### Recommended Additions

1. **E2E Tests**: Full end-to-end tests with real CLI tool
2. **Performance Tests**: Measure response times and resource usage
3. **Load Tests**: Test concurrent request handling
4. **Security Tests**: Test for common vulnerabilities
5. **Snapshot Tests**: Test API response formats
6. **Contract Tests**: Validate input/output contracts
7. **Chaos Tests**: Test behavior under failure conditions

### Test Coverage Goals

- **Line Coverage**: Aim for 80%+
- **Branch Coverage**: Aim for 75%+
- **Function Coverage**: Aim for 90%+

### Continuous Improvement

1. Add tests for new features
2. Add tests when bugs are found
3. Refactor tests to reduce duplication
4. Update tests when APIs change
5. Monitor test execution time
