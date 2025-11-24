#!/bin/bash

# This script tests the API by sending a ZIP file and verifying the response

# Default values
API_URL="http://localhost:3000"
ZIP_FILE="/tmp/comapeo-v1-config.zip"
OUTPUT_FILE="response-v1.comapeocat"
OUTPUT_FILE_V2="response-v2.comapeocat"

ensure_v1_zip() {
  if [ -f "$ZIP_FILE" ]; then
    echo "Using existing v1 ZIP at $ZIP_FILE"
    return
  fi
  echo "Downloading v1-compatible config (v5.0.0 source ZIP)..."
  curl -L -o "$ZIP_FILE" https://github.com/digidem/mapeo-default-config/archive/refs/tags/v5.0.0.zip
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --url)
      API_URL="$2"
      shift 2
      ;;
    --file)
      ZIP_FILE="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

ensure_v1_zip

# Check if the API is running
echo "Checking if API is running at $API_URL..."
health_response=$(curl -s "$API_URL/health")
if [[ $health_response == *"\"status\":\"ok\""* ]]; then
  echo "API is running"
else
  echo "API is not running or health check failed"
  echo "Response: $health_response"
  echo "Falling back to in-process integration tests (no running server needed)..."
  bun test src/tests/integration/routes.test.ts
  exit $?
fi

# Send the ZIP file to the v1 API
echo "Sending ZIP file to /v1..."
response=$(curl -s -X POST -F "file=@$ZIP_FILE" "$API_URL/v1" -o "$OUTPUT_FILE" -w "%{http_code}")

# Check the response
if [[ $response == "200" ]]; then
  echo "API test passed with status code 200"
  
  # Verify the response is a valid comapeocat file
  file_size=$(stat -c%s "$OUTPUT_FILE")
  echo "Received comapeocat file with size: $file_size bytes"
  
  # Check if it's a valid ZIP file
  if unzip -t "$OUTPUT_FILE" > /dev/null 2>&1; then
    echo "Valid comapeocat file received"
    
    # List the contents of the comapeocat file
    echo "Contents of the comapeocat file:"
    unzip -l "$OUTPUT_FILE"
    
    echo "Test completed successfully"
    exit 0
  else
    echo "Invalid comapeocat file received"
    exit 1
  fi
else
  echo "v1 API test failed with status code: $response"
  exit 1
fi

# Prepare JSON payload for v2
cat > /tmp/comapeo-v2-payload.json <<'EOF'
{
  "metadata": { "name": "api-test", "version": "1.0.0" },
  "categories": [
    {
      "id": "category-1",
      "name": "Category 1",
      "appliesTo": ["observation", "track"],
      "tags": { "categoryId": "category-1" },
      "fields": ["field-1"],
      "track": true
    }
  ],
  "fields": [
    {
      "id": "field-1",
      "name": "Field 1",
      "tagKey": "field-1",
      "type": "text"
    }
  ],
  "icons": [],
  "translations": {
    "en": { "labels": { "category-1": "Category 1" } }
  }
}
EOF

echo "Sending JSON payload to /v2..."
response_v2=$(curl -s -X POST -H "Content-Type: application/json" \
  -d @/tmp/comapeo-v2-payload.json "$API_URL/v2" -o "$OUTPUT_FILE_V2" -w "%{http_code}")

if [[ $response_v2 == "200" ]]; then
  echo "v2 API test passed with status code 200"
  file_size=$(stat -c%s "$OUTPUT_FILE_V2")
  echo "Received comapeocat file with size: $file_size bytes"
  if unzip -t "$OUTPUT_FILE_V2" > /dev/null 2>&1; then
    echo "Valid comapeocat file received from v2"
  else
    echo "Invalid comapeocat file received from v2"
    exit 1
  fi
else
  echo "v2 API test failed with status code: $response_v2"
  exit 1
fi
