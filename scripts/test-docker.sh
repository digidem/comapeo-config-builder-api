#!/bin/bash

# This script builds and tests the Docker image with a focus on the mapnik dependency

# Set colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Function to print colored messages
info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Function to clean up resources
cleanup() {
  info "Cleaning up resources..."
  docker stop comapeo-test 2>/dev/null || true
  docker rm comapeo-test 2>/dev/null || true
  rm -f test-config.zip response.comapeocat 2>/dev/null || true
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Build the Docker image
info "Building Docker image..."
docker build -t comapeo-config-builder-api:test . || { error "Docker build failed"; exit 1; }

# Test mapeo-settings-builder directly in the container
info "Testing mapeo-settings-builder in the container..."
mapeo_test=$(docker run --rm comapeo-config-builder-api:test mapeo-settings-builder --version 2>&1)

if [[ $? -ne 0 ]]; then
  error "mapeo-settings-builder test failed:"
  error "$mapeo_test"
  exit 1
fi

success "mapeo-settings-builder test passed: $mapeo_test"

# Run the Docker container
info "Running Docker container..."
# First, check if port 3000 is already in use
if nc -z localhost 3000 2>/dev/null ; then
  info "Port 3000 is already in use, using port 3001 instead"
  docker run -d -p 3001:3000 --name comapeo-test comapeo-config-builder-api:test || { error "Failed to start container"; exit 1; }
  export API_PORT=3001
else
  docker run -d -p 3000:3000 --name comapeo-test comapeo-config-builder-api:test || { error "Failed to start container"; exit 1; }
  export API_PORT=3000
fi

# Wait for the container to start
info "Waiting for container to start..."
sleep 5

# Check the health endpoint
info "Checking health endpoint on port $API_PORT..."
health_response=$(curl -s http://localhost:$API_PORT/health)
if [[ $health_response == *"\"status\":\"ok\""* ]]; then
  success "Health check passed"
else
  error "Health check failed"
  error "Response: $health_response"
  docker logs comapeo-test
  exit 1
fi

# Download a test ZIP file
info "Downloading test ZIP file..."
curl -L -o test-config.zip https://github.com/digidem/mapeo-default-config/archive/refs/heads/main.zip || { error "Failed to download test ZIP file"; exit 1; }

# Test the API with the ZIP file
info "Testing API with ZIP file on port $API_PORT..."
response=$(curl -v -X POST -F "file=@test-config.zip" http://localhost:$API_PORT/ -o response.comapeocat -w "%{http_code}" 2>&1)
status_code=$(echo "$response" | tail -n1)

# Check the response
if [[ $status_code == "200" ]]; then
  success "API test passed with status code 200"

  # Verify the response is a valid comapeocat file
  file_size=$(stat -c%s "response.comapeocat")
  info "Received comapeocat file with size: $file_size bytes"

  # Check if it's a valid ZIP file
  if unzip -t response.comapeocat > /dev/null 2>&1; then
    success "Valid comapeocat file received"

    # List the contents of the comapeocat file
    info "Contents of the comapeocat file:"
    unzip -l response.comapeocat

    success "Test completed successfully"
  else
    error "Invalid comapeocat file received"
    docker logs comapeo-test
    exit 1
  fi
else
  error "API test failed with status code: $status_code"
  error "Response details:"
  echo "$response"
  docker logs comapeo-test
  exit 1
fi

success "All tests passed!"

