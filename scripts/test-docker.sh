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
  docker stop comapeo-test comapeo-test-ci 2>/dev/null || true
  docker rm comapeo-test comapeo-test-ci 2>/dev/null || true
  rm -f test-config.zip response.comapeocat response-v2.comapeocat test-config-ci.zip response-ci.comapeocat response-ci-v2.comapeocat 2>/dev/null || true
}

ensure_v1_zip() {
  local target="$1"
  if [ -f "$target" ]; then
    return
  fi
  info "Downloading v1-compatible config (v5.0.0 source ZIP)..."
  curl -L -o "$target" https://github.com/digidem/mapeo-default-config/archive/refs/tags/v5.0.0.zip || { error "Failed to download v1 config zip"; return 1; }
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Build the Docker image with CI mode for testing
info "Building Docker image in CI mode for testing..."
docker build --build-arg CI=true --build-arg NODE_ENV=production -t comapeo-config-builder-api:ci . || { error "Docker build failed"; exit 1; }

# Test the CI mode image
info "Testing CI mode image..."
test_ci_container() {
  # Run the Docker container
  info "Running CI mode Docker container..."
  if nc -z localhost 3000 2>/dev/null ; then
    info "Port 3000 is already in use, using port 3001 instead"
    docker run -d -p 3001:3000 --name comapeo-test-ci comapeo-config-builder-api:ci || { error "Failed to start CI container"; return 1; }
    export API_PORT=3001
  else
    docker run -d -p 3000:3000 --name comapeo-test-ci comapeo-config-builder-api:ci || { error "Failed to start CI container"; return 1; }
    export API_PORT=3000
  fi

  # Wait for the container to start
  info "Waiting for CI container to start..."
  sleep 5

  # Check the health endpoint
  info "Checking health endpoint on port $API_PORT..."
  health_response=$(curl -s http://localhost:$API_PORT/health)
  if [[ $health_response == *"\"status\":\"ok\""* ]]; then
    success "Health check passed for CI mode"
  else
    error "Health check failed for CI mode"
    error "Response: $health_response"
    docker logs comapeo-test-ci
    docker stop comapeo-test-ci
    docker rm comapeo-test-ci
    return 1
  fi

  # Create a test ZIP file
  ensure_v1_zip test-config-ci.zip

  # Test the API with the ZIP file
  info "Testing API with ZIP file on port $API_PORT in CI mode..."
  response=$(curl -v -X POST -F "file=@test-config-ci.zip" http://localhost:$API_PORT/v1 -o response-ci.comapeocat -w "%{http_code}" 2>&1)
  status_code=$(echo "$response" | tail -n1)

  # Check the response
  if [[ $status_code == "200" ]]; then
    success "v1 API test passed with status code 200 in CI mode"

    # Verify the response is a valid comapeocat file
    file_size=$(stat -c%s "response-ci.comapeocat")
    info "Received comapeocat file with size: $file_size bytes in CI mode"

    # Check if it's a valid ZIP file
    if unzip -t response-ci.comapeocat > /dev/null 2>&1; then
      success "Valid comapeocat file received in CI mode"

      # List the contents of the comapeocat file
      info "Contents of the comapeocat file in CI mode:"
      unzip -l response-ci.comapeocat

      success "v1 path validated"
    else
      error "Invalid comapeocat file received in CI mode"
      docker logs comapeo-test-ci
      docker stop comapeo-test-ci
      docker rm comapeo-test-ci
      return 1
    fi
  else
    error "v1 API test failed with status code: $status_code in CI mode"
    error "Response details:"
    echo "$response"
    docker logs comapeo-test-ci
    docker stop comapeo-test-ci
    docker rm comapeo-test-ci
    return 1
  fi

  # Prepare JSON payload for v2
  cat > /tmp/comapeo-v2-payload-ci.json <<'EOF'
{
  "metadata": { "name": "docker-ci", "version": "1.0.0" },
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
  "translations": { "en": { "labels": { "category-1": "Category 1" } } }
}
EOF

  info "Testing v2 JSON builder on port $API_PORT..."
  response_v2=$(curl -s -X POST -H "Content-Type: application/json" -d @/tmp/comapeo-v2-payload-ci.json \
    http://localhost:$API_PORT/v2 -o response-ci-v2.comapeocat -w "%{http_code}")

  if [[ $response_v2 == "200" ]]; then
    success "v2 API test passed with status code 200 in CI mode"
    if unzip -t response-ci-v2.comapeocat > /dev/null 2>&1; then
      success "Valid comapeocat file received from v2 in CI mode"
    else
      error "Invalid comapeocat file received from v2 in CI mode"
      docker logs comapeo-test-ci
      docker stop comapeo-test-ci
      docker rm comapeo-test-ci
      return 1
    fi
  else
    error "v2 API test failed with status code: $response_v2 in CI mode"
    docker logs comapeo-test-ci
    docker stop comapeo-test-ci
    docker rm comapeo-test-ci
    return 1
  fi

  success "CI mode test completed successfully"
  docker stop comapeo-test-ci
  docker rm comapeo-test-ci
  rm -f test-config-ci.zip response-ci.comapeocat response-ci-v2.comapeocat /tmp/comapeo-v2-payload-ci.json
  return 0
}

# Run the CI mode test
test_ci_container || { error "CI mode test failed"; exit 1; }
success "CI mode test passed!"

# Now build the Docker image with production settings
info "Building Docker image for production..."
docker build --build-arg CI=false --build-arg NODE_ENV=production -t comapeo-config-builder-api:test . || { error "Docker build failed"; exit 1; }

# Test the production image
info "Testing production mode image..."
info "Note: We expect the API test to fail in production mode without mapnik properly installed"
info "This is the correct behavior - production should not create mock files"

# Test mapeo-settings-builder directly in the container
info "Testing mapeo-settings-builder in the container..."
mapeo_test=$(docker run --rm comapeo-config-builder-api:test mapeo-settings-builder --version 2>&1)

# We expect mapeo-settings-builder to be installed
if [[ $mapeo_test == *"Using version"* ]]; then
  success "mapeo-settings-builder test passed: $mapeo_test"
else
  error "Unexpected mapeo-settings-builder output:"
  error "$mapeo_test"
  exit 1
fi

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

  # Create a test ZIP file
  ensure_v1_zip test-config.zip

# Test the API with the ZIP file
info "Testing /v1 API with ZIP file on port $API_PORT..."
response=$(curl -v -X POST -F "file=@test-config.zip" http://localhost:$API_PORT/v1 -o response.comapeocat -w "%{http_code}" 2>&1)
status_code=$(echo "$response" | tail -n1)

# Check the response
if [[ $status_code == "200" ]]; then
  success "v1 API test passed with status code 200"

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
  # In production mode, v1 may fail depending on mapnik availability
  info "v1 returned status $status_code in production mode"
fi

# v2 JSON test (should succeed without mapnik)
cat > /tmp/comapeo-v2-payload.json <<'EOF'
{
  "metadata": { "name": "docker-prod", "version": "1.0.0" },
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
  "icons": []
}
EOF

info "Testing /v2 API with JSON payload on port $API_PORT..."
response_v2=$(curl -s -X POST -H "Content-Type: application/json" -d @/tmp/comapeo-v2-payload.json \
  http://localhost:$API_PORT/v2 -o response-v2.comapeocat -w "%{http_code}")

if [[ $response_v2 == "200" ]]; then
  success "v2 API test passed with status code 200"
  if unzip -t response-v2.comapeocat > /dev/null 2>&1; then
    success "Valid comapeocat file received from v2"
  else
    error "Invalid comapeocat file received from v2"
    docker logs comapeo-test
    exit 1
  fi
else
  error "v2 API test failed with status code: $response_v2"
  docker logs comapeo-test
  exit 1
fi

success "All tests passed!"
