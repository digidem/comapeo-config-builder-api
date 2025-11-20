#!/bin/bash

# This script tests the API by sending a ZIP file and verifying the response

# Default values
API_URL="http://localhost:3000"
ZIP_FILE="test-config.zip"
OUTPUT_FILE="response.comapeocat"

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

# Check if the ZIP file exists
if [ ! -f "$ZIP_FILE" ]; then
  echo "ZIP file not found: $ZIP_FILE"
  echo "Downloading test ZIP file from GitHub..."
  curl -L -o "$ZIP_FILE" https://github.com/digidem/mapeo-default-config/archive/refs/heads/main.zip
  
  if [ ! -f "$ZIP_FILE" ]; then
    echo "Failed to download ZIP file"
    exit 1
  fi
fi

# Check if the API is running
echo "Checking if API is running at $API_URL..."
health_response=$(curl -s "$API_URL/health")
if [[ $health_response == *"\"status\":\"ok\""* ]]; then
  echo "API is running"
else
  echo "API is not running or health check failed"
  echo "Response: $health_response"
  exit 1
fi

# Send the ZIP file to the API
echo "Sending ZIP file to API..."
response=$(curl -s -X POST -F "file=@$ZIP_FILE" "$API_URL/" -o "$OUTPUT_FILE" -w "%{http_code}")

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
  echo "API test failed with status code: $response"
  exit 1
fi
