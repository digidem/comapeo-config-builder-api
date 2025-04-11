#!/bin/bash

# This script builds and tests the Docker image

# Build the Docker image
echo "Building Docker image..."
docker build -t comapeo-config-builder-api:test .

# Run the Docker container
echo "Running Docker container..."
docker run -d -p 3000:3000 --name comapeo-test comapeo-config-builder-api:test

# Wait for the container to start
echo "Waiting for container to start..."
sleep 5

# Check the health endpoint
echo "Checking health endpoint..."
health_response=$(curl -s http://localhost:3000/health)
if [[ $health_response == *"\"status\":\"ok\""* ]]; then
  echo "Health check passed"
else
  echo "Health check failed"
  echo "Response: $health_response"
  docker logs comapeo-test
  docker stop comapeo-test
  docker rm comapeo-test
  exit 1
fi

# Download a test ZIP file
echo "Downloading test ZIP file..."
curl -L -o test-config.zip https://github.com/digidem/mapeo-default-config/archive/refs/heads/main.zip

# Test the API with the ZIP file
echo "Testing API with ZIP file..."
response=$(curl -s -X POST -F "file=@test-config.zip" http://localhost:3000/ -o response.comapeocat -w "%{http_code}")

# Check the response
if [[ $response == "200" ]]; then
  echo "API test passed with status code 200"
  
  # Verify the response is a valid comapeocat file
  file_size=$(stat -c%s "response.comapeocat")
  echo "Received comapeocat file with size: $file_size bytes"
  
  # Check if it's a valid ZIP file
  if unzip -t response.comapeocat > /dev/null 2>&1; then
    echo "Valid comapeocat file received"
    
    # List the contents of the comapeocat file
    echo "Contents of the comapeocat file:"
    unzip -l response.comapeocat
    
    echo "Test completed successfully"
  else
    echo "Invalid comapeocat file received"
    docker logs comapeo-test
    docker stop comapeo-test
    docker rm comapeo-test
    exit 1
  fi
else
  echo "API test failed with status code: $response"
  docker logs comapeo-test
  docker stop comapeo-test
  docker rm comapeo-test
  exit 1
fi

# Stop and remove the container
echo "Stopping and removing container..."
docker stop comapeo-test
docker rm comapeo-test

# Clean up
echo "Cleaning up..."
rm -f test-config.zip response.comapeocat

echo "All tests passed!"
