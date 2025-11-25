# Comapeo Config Builder API

This project provides a dual-mode API for building CoMapeo configuration archives (`.comapeocat`).

- `/v1` (legacy): accepts a ZIP upload and shells out to `mapeo-settings-builder` (unchanged behavior; root `/` aliases to `/v1`).
- `/v2` (new): accepts a JSON payload and uses `comapeocat@1.1.0` Writer to produce a `.comapeocat` stream with stricter validation.

Key features:
- Versioned routing: `/v1` (ZIP → CLI) and `/v2` (JSON → Writer); root `/` maps to `/v1` for backward compatibility.
- `comapeocat` Writer with provenance (`builderName: "comapeocat"`, `builderVersion: 1.1.0`).
- Validation caps: JSON ≤ 1 MB, SVG icons ≤ 2 MB, ≤ 10k total entries, BCP‑47 locales, required `appliesTo` and `tags` per category.
- Automatic field/type mapping for legacy inputs (e.g., `boolean` → `selectOne` with Yes/No options).
- Scripted tests for both versions (`scripts/test-api.sh`, `scripts/test-docker.sh`).

## Project Structure

- **src/**: Source code
  - **config/**: Application configuration
  - **controllers/**: API route handlers
  - **middleware/**: Express middleware functions
  - **services/**: Business logic
  - **types/**: TypeScript type definitions
  - **utils/**: Utility functions
  - **tests/**: Test files
    - **unit/**: Unit tests
    - **integration/**: Integration tests
    - **utils/**: Test utilities

## Installation

### Using Docker

1. **Pull the Docker image:**

    ```bash
    docker pull ghcr.io/digidem/comapeo-config-builder-api:latest
    ```

2. **Run the Docker container:**

    ```bash
    docker run -p 3000:3000 ghcr.io/digidem/comapeo-config-builder-api:latest
    ```

3. **Build and run locally:**

    ```bash
    docker build -t comapeo-config-builder-api:local .
    docker run -p 3000:3000 comapeo-config-builder-api:local
    ```

### Using Bun

1. **Install dependencies:**

    ```bash
    bun install
    ```

2. **Install builders:**

    ```bash
    npm install -g mapeo-settings-builder
    bun install   # pulls comapeocat@1.1.0
    ```

3. **Run the application:**

    ```bash
    bun run dev
    ```

## Development

### Running the API

```bash
# Development mode with hot reload
bun run dev

# Production mode
bun run start
```

### Testing

```bash
# Run all tests
bun test

# Run tests with coverage
bun test --coverage

# Run specific test files
bun test src/tests/unit/utils/shell.test.ts

# Test the API with a real ZIP file
./scripts/test-api.sh

# Test the API with a custom URL and ZIP file
./scripts/test-api.sh --url http://localhost:3000 --file path/to/config.zip --output response.comapeocat
```

### Building

```bash
# Build the project
bun run build
```

### Linting

```bash
# Run linter
bun run lint
```

## Usage

### API Endpoints

#### Health Check

```
GET /health
```

#### v1 (legacy ZIP → mapeo-settings-builder)

```
POST /v1
POST /           # alias to /v1
Content-Type: multipart/form-data
body: file=@config.zip
```

Example:

```bash
curl -X POST -F "file=@config.zip" -o out.comapeocat http://localhost:3000/v1
```

#### v2 (JSON → comapeocat Writer)

```
POST /v2
Content-Type: application/json
```

Minimal payload:

```json
{
  "metadata": { "name": "demo", "version": "1.0.0" },
  "categories": [
    {
      "id": "cat-1",
      "name": "Trees",
      "appliesTo": ["observation", "track"],
      "fields": ["field-1"],
      "tags": { "categoryId": "cat-1" },
      "track": true
    }
  ],
  "fields": [
    { "id": "field-1", "name": "Species", "tagKey": "species", "type": "select", "options": [{ "label": "Oak", "value": "oak" }] }
  ],
  "icons": [{ "id": "tree", "svgUrl": "https://example.com/tree.svg" }],
  "translations": { "en": { "labels": { "cat-1": "Trees" } } }
}
```

Field/type mapping rules (v2):

- `select` → `selectOne`
- `multiselect` → `selectMultiple`
- `textarea` → `text`
- `integer` → `number`
- `boolean` → `selectOne` with options `{Yes:true, No:false}`
- `date`/`datetime` → `text` (appearance `singleline`, helper "ISO date")
- `photo`/`location` → `text`
- Unsupported types → 400 error

Category selection (v2): order-preserving; all categories → observation list; categories with `track: true` added to track list (must be non-empty).

Limits (enforced server-side):

- JSON payload ≤ 1 MB; translations per locale ≤ 1 MB
- SVG icons ≤ 2 MB (inline `svgData` or fetched from `svgUrl` with content-type check & timeout)
- Total entries ≤ 10,000
- Categories require `appliesTo` and `tags` (defaults to `{ categoryId: <id> }` if tags missing/empty)
- Locales validated as BCP‑47

## CI/CD

The project uses GitHub Actions for continuous integration and deployment:

- **CI Workflow**: Runs tests, type checking, and health checks on every push and pull request
- **Docker Build, Test, and Deploy**: Builds the Docker image, tests it with real API requests, and deploys it to GitHub Container Registry
- **Security Scan**: Checks for vulnerabilities in dependencies and Docker image
- **Lint**: Ensures code quality and style consistency

## License

MIT
