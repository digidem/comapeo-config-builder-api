#!/bin/bash

# Create a temporary directory
TMP_DIR=$(mktemp -d)
ZIP_FILE="$TMP_DIR/mapeo-default-config.zip"
OUTPUT_FILE="$TMP_DIR/output.comapeocat"

echo "Temporary directory: $TMP_DIR"

# Download the ZIP file from GitHub
echo "Downloading ZIP file from GitHub..."
curl -L -o "$ZIP_FILE" "https://github.com/digidem/mapeo-default-config/archive/refs/heads/main.zip"

# Check if the download was successful
if [ ! -f "$ZIP_FILE" ]; then
  echo "Failed to download ZIP file"
  exit 1
fi

echo "ZIP file downloaded to $ZIP_FILE"
echo "File size: $(stat -c%s "$ZIP_FILE") bytes"

# Send the ZIP file to the API
echo "Sending ZIP file to API..."
curl -v -F "file=@$ZIP_FILE" http://localhost:3001/ -o "$OUTPUT_FILE"

# Check if the request was successful
if [ ! -f "$OUTPUT_FILE" ]; then
  echo "Failed to get response from API"
  exit 1
fi

echo "Response saved to $OUTPUT_FILE"
echo "File size: $(stat -c%s "$OUTPUT_FILE") bytes"

# Try to identify the file type
echo "File type: $(file "$OUTPUT_FILE")"

# If the file is a ZIP file, list its contents
if file "$OUTPUT_FILE" | grep -q "Zip archive"; then
  echo "Listing ZIP file contents..."
  unzip -l "$OUTPUT_FILE"
else
  # If the file is not a ZIP file, try to display it as text
  echo "File contents (first 500 bytes):"
  head -c 500 "$OUTPUT_FILE" | cat -A
fi

# Clean up
echo "Cleaning up..."
rm -rf "$TMP_DIR"

echo "Done"
