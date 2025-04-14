# Comapeo Config Builder API - Source Code

This directory contains the source code for the Comapeo Config Builder API.

## Directory Structure

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

## Main Components

- **index.ts**: Application entry point
- **config/app.ts**: Application configuration
- **controllers/**: Contains route handlers
  - **healthController.ts**: Health check endpoint
  - **settingsController.ts**: Settings upload and build endpoint
- **services/settingsBuilder.ts**: Service for building Comapeo settings
- **middleware/**: Contains middleware functions
  - **errorHandler.ts**: Global error handler
  - **logger.ts**: Request logging middleware
- **utils/shell.ts**: Utilities for running shell commands

## Testing

Run tests with:

```bash
# Run all tests
bun test

# Run unit tests only
bun test:unit

# Run integration tests only
bun test:integration
```
