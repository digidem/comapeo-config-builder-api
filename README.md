# Comapeo Config Builder API

This project provides an API for building CoMapeo configuration settings using the `mapeo-settings-builder` tool. It accepts a ZIP file containing CoMapeo configuration files, processes it, and outputs a `.comapeocat` file. The API streamlines the process of converting raw configuration data into a format that can be directly used by CoMapeo applications.

Key features:
- Accepts a ZIP file upload containing CoMapeo configuration settings
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

Use the following `curl` command to POST a ZIP file to the API:

```bash
curl -X POST -H "Content-Type: multipart/form-data" -F "file=@config-cultural-monitoring.zip" --output config-cultural-monitoring.comapeocat http://localhost:3000/
```

### API Endpoints

#### Health Check

```
GET /health
```

Returns the health status of the API.

#### Build Configuration

```
POST /
```

Builds a Comapeo configuration file from a ZIP file.

## CI/CD

The project uses GitHub Actions for continuous integration and deployment:

- **CI Workflow**: Runs tests, type checking, and health checks on every push and pull request
- **Docker Build, Test, and Deploy**: Builds the Docker image, tests it with real API requests, and deploys it to GitHub Container Registry
- **Security Scan**: Checks for vulnerabilities in dependencies and Docker image
- **Lint**: Ensures code quality and style consistency

## License

MIT
