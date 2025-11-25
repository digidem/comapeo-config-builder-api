# Configuration

## Application Configuration

**Location**: `src/config/app.ts`

### Configuration Object

```typescript
export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  tempDirPrefix: 'comapeo-settings-',
  maxAttempts: 120,
  delayBetweenAttempts: 1000,
};
```

### Configuration Parameters

#### `port`
- **Type**: `number`
- **Default**: `3000`
- **Source**: Environment variable `PORT` or default value
- **Purpose**: HTTP server listening port
- **Usage**: `src/index.ts:6`

**Environment Variable Override**:
```bash
PORT=8080 bun run start
```

**Docker Override**:
```bash
docker run -p 8080:8080 -e PORT=8080 comapeo-config-builder-api
```

#### `tempDirPrefix`
- **Type**: `string`
- **Default**: `'comapeo-settings-'`
- **Purpose**: Prefix for temporary directory names
- **Usage**: `src/services/settingsBuilder.ts:15`

**Example Directory Names**:
- `/tmp/comapeo-settings-abc123def456/`
- `/tmp/comapeo-settings-xyz789uvw012/`

#### `maxAttempts`
- **Type**: `number`
- **Default**: `120`
- **Purpose**: Maximum number of polling attempts to check for built file
- **Usage**: `src/services/settingsBuilder.ts:36`

**Calculation**:
- Total wait time: `maxAttempts × delayBetweenAttempts`
- Default: `120 × 1000ms = 120,000ms = 120 seconds = 2 minutes`

**Customization Example**:
```typescript
// For faster timeout (30 seconds)
maxAttempts: 30,
delayBetweenAttempts: 1000

// For longer timeout (5 minutes)
maxAttempts: 300,
delayBetweenAttempts: 1000
```

#### `delayBetweenAttempts`
- **Type**: `number` (milliseconds)
- **Default**: `1000` (1 second)
- **Purpose**: Delay between file polling attempts
- **Usage**: `src/services/settingsBuilder.ts:48`

**Trade-offs**:
- Lower values: More responsive, higher CPU usage
- Higher values: More efficient, slower detection

---

## Environment Variables

### Supported Variables

#### `PORT`
- **Required**: No
- **Default**: `3000`
- **Format**: Integer
- **Description**: Server listening port

**Examples**:
```bash
# Development
PORT=3000 bun run dev

# Production
PORT=8080 bun run start

# Docker
docker run -e PORT=8080 -p 8080:8080 comapeo-config-builder-api
```

#### `BUN_ENV`
- **Required**: No
- **Default**: Not set
- **Values**: `test`, `development`, `production`
- **Description**: Bun environment mode (used in test scripts)

**Usage in package.json**:
```json
{
  "scripts": {
    "test": "BUN_ENV=test bun test src/tests",
    "test:unit": "BUN_ENV=test bun test src/tests/unit",
    "test:integration": "BUN_ENV=test bun test src/tests/integration"
  }
}
```

#### `npm_package_version`
- **Required**: No
- **Default**: `'1.0.0'`
- **Source**: Automatically set by npm/bun from package.json
- **Description**: Package version (used in health check)
- **Usage**: `src/controllers/healthController.ts:11`

---

## TypeScript Configuration

**Location**: `tsconfig.json`

### Compiler Options

```json
{
  "include": ["src/**/*"],
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  }
}
```

### Key Settings

#### Module Configuration
- **target**: `ESNext` - Use latest JavaScript features
- **module**: `ESNext` - Use ES modules
- **moduleResolution**: `bundler` - Bun's bundler-style resolution
- **allowImportingTsExtensions**: Allow `.ts` imports
- **verbatimModuleSyntax**: Strict import/export syntax

#### Type Checking
- **strict**: `true` - Enable all strict type checking
- **noFallthroughCasesInSwitch**: Prevent switch fallthrough bugs
- **skipLibCheck**: Skip type checking of declaration files (faster builds)

#### Relaxed Settings
- **noUnusedLocals**: `false` - Allow unused local variables
- **noUnusedParameters**: `false` - Allow unused function parameters
- **noPropertyAccessFromIndexSignature**: `false` - Allow bracket notation

#### Build Settings
- **noEmit**: `true` - Don't emit compiled files (Bun handles this)

---

## Package Configuration

**Location**: `package.json`

### Scripts

```json
{
  "start": "bun run src/index.ts",
  "dev": "bun --watch src/index.ts",
  "build": "bun build src/index.ts --outdir ./dist --target node",
  "lint": "biome lint .",
  "test": "BUN_ENV=test bun test src/tests",
  "test:unit": "BUN_ENV=test bun test src/tests/unit",
  "test:integration": "BUN_ENV=test bun test src/tests/integration",
  "audit": "npm audit --production"
}
```

### Module Configuration

```json
{
  "name": "comapeo-config-builder-api",
  "module": "src/index.ts",
  "type": "module"
}
```

- **type**: `"module"` - Use ES modules (not CommonJS)
- **module**: Entry point for the application

---

## Docker Configuration

**Location**: `Dockerfile`

### Build Arguments
None currently defined

### Environment Variables in Docker

Default runtime environment:
- `PORT`: `3000` (can be overridden with `-e` flag)
- `NODE_ENV`: Not set by default

### Exposed Ports
- `3000` - Default HTTP port

### Volume Mounts
None required (stateless application)

**Recommended for debugging**:
```bash
# Mount temp directory to inspect build artifacts
docker run -v /tmp/docker-builds:/tmp -p 3000:3000 comapeo-config-builder-api
```

---

## Configuration Best Practices

### Environment-Specific Configuration

**Development**:
```bash
PORT=3000 bun run dev
```

**Production**:
```bash
PORT=8080 bun run start
```

**Testing**:
```bash
BUN_ENV=test bun test
```

### Docker Configuration

**Development Build**:
```bash
docker build -t comapeo-config-builder-api:dev .
docker run -p 3000:3000 comapeo-config-builder-api:dev
```

**Production Build**:
```bash
docker build -t comapeo-config-builder-api:prod .
docker run -p 8080:8080 -e PORT=8080 comapeo-config-builder-api:prod
```

---

## Configuration Extension Points

### Adding New Configuration

To add new configuration options:

1. **Update `src/config/app.ts`**:
```typescript
export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  tempDirPrefix: 'comapeo-settings-',
  maxAttempts: 120,
  delayBetweenAttempts: 1000,
  // New configuration
  maxFileSize: process.env.MAX_FILE_SIZE
    ? parseInt(process.env.MAX_FILE_SIZE)
    : 100_000_000, // 100MB default
};
```

2. **Document environment variable** in README.md and this file

3. **Use in service/controller**:
```typescript
import { config } from '../config/app';

if (fileSize > config.maxFileSize) {
  throw new ValidationError('File too large');
}
```

### Configuration Validation

Currently no validation is performed on configuration values. Consider adding:

```typescript
function validateConfig(config: typeof config) {
  if (config.port < 1 || config.port > 65535) {
    throw new Error('Invalid port number');
  }
  if (config.maxAttempts < 1) {
    throw new Error('maxAttempts must be positive');
  }
  if (config.delayBetweenAttempts < 100) {
    throw new Error('delayBetweenAttempts too short');
  }
  return config;
}

export const config = validateConfig({ /* ... */ });
```

---

## Security Configuration

### Current State
- No authentication
- No rate limiting
- No file size limits
- CORS enabled for all origins

### Production Recommendations

1. **Add Authentication**:
```typescript
// Example: API key middleware
app.use((context) => {
  const apiKey = context.request.headers.get('x-api-key');
  if (apiKey !== process.env.API_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }
});
```

2. **Configure CORS**:
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
```

3. **Add Rate Limiting**:
```typescript
// Example using external middleware
import { rateLimit } from '@elysiajs/rate-limit';

app.use(rateLimit({
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  timeWindow: '15m'
}));
```

4. **File Size Limits**:
```typescript
app.use({
  bodyLimit: parseInt(process.env.MAX_BODY_SIZE || '104857600') // 100MB
});
```
