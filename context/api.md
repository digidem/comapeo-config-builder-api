# API Documentation

## Base URL

- **Local Development**: `http://localhost:3000`
- **Docker**: `http://localhost:3000` (mapped port)

## Endpoints

### 1. Health Check

#### `GET /health`

Returns the health status of the API server.

**Request**: No parameters required

**Response**: JSON object

```json
{
  "status": "ok",
  "timestamp": "2025-01-20T12:34:56.789Z"
}
```

**Status Codes**:
- `200 OK` - Service is healthy

**Example**:
```bash
curl http://localhost:3000/health
```

**Implementation**: `src/app.ts:13-16`

---

### 2. Build Configuration

#### `POST /`

Processes a ZIP file containing CoMapeo configuration and returns a built `.comapeocat` file.

**Content-Type**: `multipart/form-data`

**Request Body**:
- `file` (File, required): ZIP file containing CoMapeo configuration

**ZIP File Requirements**:
- Must contain a `metadata.json` file at the root level
- `metadata.json` must include:
  - `name` (string): Configuration name
  - `version` (string): Configuration version

**Response**: Binary file stream (`.comapeocat` file)

**Status Codes**:
- `200 OK` - File processed successfully, returns `.comapeocat` file
- `500 Internal Server Error` - Processing failed

**Success Response**:
- Content-Type: `application/octet-stream` (binary)
- Body: `.comapeocat` file (ZIP format containing built configuration)

**Error Response**:
```json
{
  "status": 500,
  "message": "Error processing the data: [error details]"
}
```

**Examples**:

Basic usage:
```bash
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@config.zip" \
  --output output.comapeocat \
  http://localhost:3000/
```

With verbose output:
```bash
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@config-cultural-monitoring.zip" \
  --output config-cultural-monitoring.comapeocat \
  -v \
  http://localhost:3000/
```

**Implementation**: `src/controllers/settingsController.ts`

**Processing Flow**:
1. Receives uploaded ZIP file
2. Converts File object to ArrayBuffer
3. Calls `buildSettings(zipBuffer)` service
4. Returns built file via `Bun.file(builtSettingsPath)`

---

## CORS Configuration

The API has CORS enabled for all origins using `@elysiajs/cors`.

**Headers Allowed**:
- All origins (`*`)
- All methods
- All headers

**Implementation**: `src/app.ts:10` - `.use(cors())`

---

## Request/Response Formats

### File Upload Format

The API expects files in `multipart/form-data` format with:
- Field name: `file`
- File type: ZIP archive
- Required internal structure:
  ```
  config.zip
  ├── metadata.json        # Required
  ├── presets/             # Optional
  ├── fields/              # Optional
  └── [other config files]
  ```

### metadata.json Structure

Required fields:
```json
{
  "name": "my-config",
  "version": "1.0.0"
}
```

The output filename will be: `{name}-{version}.comapeocat`

Example: `my-config-1.0.0.comapeocat`

### Response File Format

The `.comapeocat` file is a ZIP archive containing:
- Processed configuration data
- Icons and assets
- Schema definitions
- Preset configurations

**File Type**: Binary (application/octet-stream)
**Format**: ZIP archive
**Extension**: `.comapeocat`

---

## Error Handling

### Error Response Format

All errors return JSON with the following structure:

```json
{
  "status": <http_status_code>,
  "message": "<error_message>"
}
```

### Common Errors

**No File Provided**:
```json
{
  "status": 500,
  "message": "Error processing the data: No file provided in the request body"
}
```

**Invalid ZIP File**:
```json
{
  "status": 500,
  "message": "Error processing the data: Failed to extract ZIP file"
}
```

**Missing metadata.json**:
```json
{
  "status": 500,
  "message": "Error processing the data: metadata.json not found"
}
```

**Build Timeout**:
```json
{
  "status": 500,
  "message": "Error processing the data: No .comapeocat file found in the build directory after waiting"
}
```

**Build Failed**:
```json
{
  "status": 500,
  "message": "Error processing the data: mapeo-settings-builder command failed"
}
```

---

## Request Flow Diagram

```
Client
  ↓
POST / with multipart file
  ↓
Elysia Framework
  ↓
settingsController.handleBuildSettings()
  ├─ Validate file exists
  ├─ Convert File to ArrayBuffer
  ↓
settingsBuilder.buildSettings()
  ├─ Create temp directory
  ├─ Extract ZIP
  ├─ Read metadata.json
  ├─ Spawn mapeo-settings-builder CLI
  ├─ Poll for output file (up to 120s)
  ├─ Return file path
  ↓
Return Bun.file() stream
  ↓
Client receives .comapeocat file
```

---

## Timeouts and Limits

**Build Timeout**: 120 seconds (configurable)
- Max polling attempts: 120
- Delay between attempts: 1000ms
- Total max wait time: 120 seconds

**File Size Limits**: No explicit limit set (depends on Elysia/Bun defaults)

**Concurrent Requests**: Supports multiple concurrent requests (each gets isolated temp directory)

---

## Authentication

**Current**: No authentication required

The API is currently open and does not require authentication. Consider implementing authentication for production deployments:
- API keys
- JWT tokens
- OAuth 2.0

---

## Rate Limiting

**Current**: No rate limiting implemented

Consider implementing rate limiting for production deployments to prevent abuse.

---

## Testing the API

### Using curl

```bash
# Health check
curl http://localhost:3000/health

# Build configuration
curl -X POST \
  -F "file=@config.zip" \
  --output result.comapeocat \
  http://localhost:3000/
```

### Using test script

```bash
# Use default settings
./scripts/test-api.sh

# Custom URL and file
./scripts/test-api.sh \
  --url http://localhost:3000 \
  --file my-config.zip \
  --output my-result.comapeocat
```

### Integration Tests

Located in: `src/tests/integration/`

Run with: `bun run test:integration`

---

## API Versioning

**Current**: No versioning (v1 implicit)

The API currently has no explicit versioning. Future versions could use:
- URL path versioning: `/v2/`
- Header versioning: `Accept: application/vnd.api+json;version=2`
- Query parameter versioning: `?version=2`
