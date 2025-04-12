#!/bin/bash

# Set strict error handling
set -e

# Define colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions for logging
info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if a port is in use
is_port_in_use() {
  lsof -i:"$1" >/dev/null 2>&1
  return $?
}

# Function to find an available port starting from the given port
find_available_port() {
  local port=$1
  while is_port_in_use "$port"; do
    info "Port $port is already in use, trying next port..."
    port=$((port + 1))
  done
  echo "$port"
}

# Function to wait for container to be ready
wait_for_container() {
  local container_name=$1
  local port=$2
  local max_attempts=30
  local delay=1

  info "Waiting for container to start..."
  
  # Wait for container to be running
  for ((i=1; i<=max_attempts; i++)); do
    if [ "$(docker inspect -f {{.State.Running}} "$container_name" 2>/dev/null)" == "true" ]; then
      break
    fi
    
    if [ $i -eq $max_attempts ]; then
      error "Container failed to start after $max_attempts attempts"
    fi
    
    sleep $delay
  done
  
  # Wait for health endpoint to be available
  info "Checking health endpoint on port $port..."
  for ((i=1; i<=max_attempts; i++)); do
    if curl -s "http://localhost:$port/" >/dev/null 2>&1; then
      success "Health check passed"
      return 0
    fi
    
    if [ $i -eq $max_attempts ]; then
      error "Health check failed after $max_attempts attempts"
    fi
    
    sleep $delay
  done
}

# Function to clean up resources
cleanup() {
  info "Cleaning up resources..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -rf "$TEMP_DIR" >/dev/null 2>&1 || true
  rm -f test-config.zip response.comapeocat >/dev/null 2>&1 || true
}

# Set up trap to clean up on exit
trap cleanup EXIT

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
CONTAINER_NAME="comapeo-test-$(date +%s)"
DEFAULT_PORT=3000
API_PORT=$(find_available_port $DEFAULT_PORT)

# Step 1: Build the Docker image
info "Building Docker image..."
docker build -t comapeo-config-builder-api:test . || error "Docker build failed"

# Step 2: Download the mapeo-default-config repository
info "Downloading mapeo-default-config repository..."
curl -L -o "$TEMP_DIR/mapeo-default-config.zip" https://github.com/digidem/mapeo-default-config/archive/refs/heads/main.zip || error "Failed to download mapeo-default-config"

# Step 3: Unzip the repository
info "Extracting mapeo-default-config repository..."
unzip -q "$TEMP_DIR/mapeo-default-config.zip" -d "$TEMP_DIR" || error "Failed to extract mapeo-default-config"

# Step 4: Create a properly formatted ZIP file
info "Creating properly formatted ZIP file..."
cd "$TEMP_DIR/mapeo-default-config-main" || error "Failed to change directory"
zip -r "$TEMP_DIR/test-config.zip" . || error "Failed to create test ZIP file"
cd - >/dev/null || error "Failed to return to original directory"

# Copy the ZIP file to the current directory
cp "$TEMP_DIR/test-config.zip" . || error "Failed to copy test ZIP file"

# Step 5: Run the Docker container
info "Running Docker container on port $API_PORT..."
docker run -d -p "$API_PORT:3000" --name "$CONTAINER_NAME" comapeo-config-builder-api:test || error "Failed to run Docker container"

# Step 6: Wait for the container to be ready
wait_for_container "$CONTAINER_NAME" "$API_PORT"

# Step 7: Test the API with the prepared ZIP file
info "Testing API with ZIP file on port $API_PORT..."
RESPONSE=$(curl -s -X POST -F "file=@test-config.zip" "http://localhost:$API_PORT/" -o response.comapeocat -w "%{http_code}")

if [ "$RESPONSE" == "200" ]; then
  info "Received comapeocat file with size: $(wc -c < response.comapeocat) bytes"
  
  # Check if the file is a valid ZIP file
  if unzip -t response.comapeocat >/dev/null 2>&1; then
    success "Valid comapeocat file received"
    info "Contents of the comapeocat file:"
    unzip -l response.comapeocat
  else
    error "Invalid comapeocat file received"
  fi
else
  error "API test failed with status code: $RESPONSE"
  error "Response details:"
  cat response.comapeocat
  docker logs "$CONTAINER_NAME"
  exit 1
fi

success "All tests passed!"
