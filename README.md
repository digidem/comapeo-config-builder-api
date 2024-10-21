# comapeo-config-builder-api

This project provides an API for building CoMapeo configuration settings using the `mapeo-settings-builder` tool. It accepts a ZIP file containing CoMapeo configuration files, processes it, and outputs a `.comapeocat` file. The API streamlines the process of converting raw configuration data into a format that can be directly used by CoMapeo applications.

Key features:
- Accepts a ZIP file upload containing CoMapeo configuration settings
- Utilizes the `mapeo-settings-builder` tool to process the configuration
- Outputs a built `.comapeocat` file ready for use in CoMapeo

## Installation

### Using Docker

1. **Run the Docker container:**

    ```bash
    docker run -p 3000:3000 communityfirst/comapeo-config-builder-api
    ```

### Using Bun

1. **Install dependencies:**

    ```bash
    bun install
    ```

2. **Install `mapeo-settings-builder` globally:**

    ```bash
    bun install -g mapeo-settings-builder
    ```

3. **Run the application:**

    ```bash 
    bun run index.ts
    ```

## Usage

Use the following `curl` command to POST a ZIP file to the API:

```bash
curl -X POST -H "Content-Type: multipart/form-data" -F "file=@config-cultural-monitoring.zip" --output config-cultural-monitoring.comapeocat  http://localhost:3000/```
```
