# Comapeo Config Builder API

> **Version 2.0.0** - Now with JSON mode support!

This project provides an API for building CoMapeo configuration settings using the `mapeo-settings-builder` tool. It accepts configuration data in **JSON format** (recommended) or as a **ZIP file** (deprecated), processes it, and outputs a `.comapeocat` file. The API streamlines the process of converting raw configuration data into a format that can be directly used by CoMapeo applications.

Key features:
- **NEW in v2.0.0**: JSON mode with structured schema and validation
- Accepts configuration data as structured JSON (icons, categories, fields, translations)
- Legacy support for ZIP file uploads (deprecated)
- Comprehensive validation with user-friendly error messages
- Utilizes the `mapeo-settings-builder` tool to process the configuration
- Outputs a built `.comapeocat` file ready for use in CoMapeo
- Robust error handling and validation
- Comprehensive test coverage

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

2. **Install `mapeo-settings-builder` globally:**

    ```bash
    npm install -g mapeo-settings-builder
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

### JSON Mode (Recommended - v2.0.0)

The new JSON mode provides structured configuration with comprehensive validation.

#### Example Request

```bash
curl -X POST http://localhost:3000/build \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "name": "Forest Monitoring",
      "version": "1.0.0",
      "description": "Configuration for forest monitoring"
    },
    "icons": [
      {
        "id": "tree_icon",
        "svgData": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\"/></svg>"
      }
    ],
    "categories": [
      {
        "id": "trees",
        "name": "Trees",
        "iconId": "tree_icon",
        "color": "#4CAF50"
      }
    ],
    "fields": [
      {
        "id": "species",
        "name": "Species",
        "type": "select",
        "options": [
          {"value": "oak", "label": "Oak"},
          {"value": "pine", "label": "Pine"}
        ]
      },
      {
        "id": "dbh",
        "name": "Diameter at Breast Height",
        "type": "number",
        "min": 0,
        "max": 500,
        "step": 0.1
      }
    ]
  }' \
  --output forest-monitoring-1.0.0.comapeocat
```

#### JSON Schema

See [JSON Schema Documentation](#json-schema) below for the complete schema definition.

### Legacy ZIP Mode (Deprecated)

**Note:** ZIP mode is deprecated and will be removed in a future version. Please migrate to JSON mode.

```bash
curl -X POST http://localhost:3000/build \
  -H "Content-Type: multipart/form-data" \
  -F "file=@config.zip" \
  --output config.comapeocat
```

When using ZIP mode, the API will include a deprecation warning header:
```
X-Deprecation-Warning: ZIP mode is deprecated; please migrate to JSON mode.
```

### API Endpoints

#### Health Check

```
GET /health
```

Returns the health status of the API.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

#### Build Configuration (v2.0.0)

```
POST /build
```

Builds a CoMapeo configuration file from JSON or ZIP input.

**Modes:**
- **JSON Mode**: Send `Content-Type: application/json` with structured configuration data
- **ZIP Mode** (deprecated): Send `Content-Type: multipart/form-data` with a ZIP file

**Success Response:**
- Status: `200 OK`
- Content-Type: `application/octet-stream`
- Content-Disposition: `attachment; filename="<name>-<version>.comapeocat"`
- Body: Binary `.comapeocat` file

**Error Response:**
- Status: `400` (validation error) or `500` (server error)
- Content-Type: `application/json`
- Body:
  ```json
  {
    "error": "ErrorType",
    "message": "Description of the error",
    "details": {}
  }
  ```

#### Legacy Build Endpoint

```
POST /
```

**Deprecated:** Use `POST /build` instead.

Builds a CoMapeo configuration file from a ZIP file (legacy endpoint maintained for backward compatibility).

## JSON Schema

The JSON mode accepts a structured configuration with the following schema:

### BuildRequest

```typescript
interface BuildRequest {
  metadata: Metadata;
  categories: Category[];
  fields: Field[];
  translations?: TranslationsByLocale;
  icons?: Icon[];
}
```

### Metadata

```typescript
interface Metadata {
  name: string;           // Required: Configuration name
  version: string;        // Required: Semantic version (e.g., "1.0.0")
  builderName?: string;   // Optional: Builder tool name
  builderVersion?: string;// Optional: Builder tool version
  description?: string;   // Optional: Human-readable description
}
```

### Icon

```typescript
interface Icon {
  id: string;            // Required: Unique identifier
  svgUrl?: string;       // URL to SVG file (mutually exclusive with svgData)
  svgData?: string;      // Inline SVG content (must start with "<svg")
  altText?: string;      // Optional: Accessibility text
  tags?: string[];       // Optional: Keywords/tags
}
```

**Note:** Each icon must have **either** `svgUrl` **or** `svgData`, but not both.

### Category

```typescript
interface Category {
  id: string;                   // Required: Unique identifier
  name: string;                 // Required: Display name
  description?: string;         // Optional: Description
  color?: string;               // Optional: Hex color code (e.g., "#4CAF50")
  iconId?: string;              // Optional: Reference to Icon.id
  parentCategoryId?: string;    // Optional: Reference to parent Category.id
  tags?: string[];              // Optional: Keywords/tags
  defaultFieldIds?: string[];   // Optional: Default fields for this category
  visible?: boolean;            // Optional: Visibility flag
}
```

### Field

```typescript
type FieldType =
   "text" | "textarea" | "number" | "integer" |
   "select" | "multiselect" | "boolean" |
   "date" | "datetime" | "photo" | "location";

interface Field {
  id: string;             // Required: Unique identifier
  name: string;           // Required: Display name
  description?: string;   // Optional: Description
  type: FieldType;        // Required: Field type
  options?: SelectOption[]; // Required for "select" and "multiselect"
  iconId?: string;        // Optional: Reference to Icon.id
  tags?: string[];        // Optional: Keywords/tags
  required?: boolean;     // Optional: Is field required?
  defaultValue?: any;     // Optional: Default value
  visible?: boolean;      // Optional: Visibility flag
  min?: number;           // Optional: Min value (for number/integer)
  max?: number;           // Optional: Max value (for number/integer)
  step?: number;          // Optional: Step value (for number/integer)
}

interface SelectOption {
  value: string;         // Required: Stored value
  label: string;         // Required: Display label
  iconId?: string;       // Optional: Reference to Icon.id
  tags?: string[];       // Optional: Keywords/tags
}
```

### Translations

```typescript
interface TranslationsByLocale {
  [locale: string]: Translations;  // Locale code (e.g., "en", "pt-BR")
}

interface Translations {
  metadata?: {
    name?: string;
    description?: string;
  };
  categories?: {
    [categoryId: string]: {
      name?: string;
      description?: string;
    }
  };
  fields?: {
    [fieldId: string]: {
      name?: string;
      description?: string;
      options?: {
        [optionValue: string]: string;  // Translated label
      }
    }
  };
  icons?: {
    [iconId: string]: {
      altText?: string;
      tags?: string[];
    }
  };
}
```

### Validation Rules

1. **Metadata**: `name` and `version` are required. `version` must follow semantic versioning (MAJOR.MINOR.PATCH).
2. **Unique IDs**: All `id` fields (Icon, Category, Field) must be unique within the configuration.
3. **References**: All `iconId`, `parentCategoryId`, and `defaultFieldIds` references must point to existing entities.
4. **Category Hierarchy**: No circular parent references are allowed.
5. **Select Fields**: Fields with type `"select"` or `"multiselect"` must have non-empty `options`.
6. **Number Constraints**: For number/integer fields, `min < max` and `step > 0`.
7. **Icons**: Must have **either** `svgUrl` **or** `svgData`. If `svgData` is used, it must start with `"<svg"`.
8. **Translations**: All referenced IDs in translations must exist in the main configuration.

### Migration Guide from ZIP to JSON

If you're currently using the ZIP mode, here's how to migrate:

1. **Metadata**: Extract `metadata.json` → `BuildRequest.metadata`
2. **Icons**: Convert SVG files in `icons/` → `BuildRequest.icons[]` with `svgData`
3. **Categories**: Convert JSON files in `categories/` → `BuildRequest.categories[]`
4. **Fields**: Convert JSON files in `fields/` → `BuildRequest.fields[]`
5. **Translations**: Convert JSON files in `translations/` → `BuildRequest.translations`

**Example:**

ZIP structure:
```
config/
  metadata.json
  icons/
    tree.svg
  categories/
    trees.json
  fields/
    species.json
```

Becomes:
```json
{
  "metadata": { ... },
  "icons": [{ "id": "tree", "svgData": "<svg>...</svg>" }],
  "categories": [{ "id": "trees", "name": "Trees", "iconId": "tree" }],
  "fields": [{ "id": "species", "name": "Species", "type": "text" }]
}
```

## CI/CD

The project uses GitHub Actions for continuous integration and deployment:

- **CI Workflow**: Runs tests, type checking, and health checks on every push and pull request
- **Docker Build, Test, and Deploy**: Builds the Docker image, tests it with real API requests, and deploys it to GitHub Container Registry
- **Security Scan**: Checks for vulnerabilities in dependencies and Docker image
- **Lint**: Ensures code quality and style consistency

## License

MIT
