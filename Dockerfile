# Use the official Bun image as the base
FROM node:18-bullseye-slim

# Set environment variables
ARG CI=false
ENV CI=$CI

# Install dependencies for mapnik and other required libraries
RUN apt-get update && apt-get install -yq \
  gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
  libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
  libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
  libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
  ca-certificates fonts-liberation libnss3 lsb-release xdg-utils wget bzip2 \
  # Additional dependencies for mapnik
  build-essential python3 libboost-all-dev libpng-dev libjpeg-dev \
  libtiff-dev libwebp-dev libicu-dev libharfbuzz-dev libfreetype6-dev \
  libxml2-dev libproj-dev libsqlite3-dev zlib1g-dev

# Install Bun with a specific version
RUN npm install -g bun@1.0.16

# Install mapnik and its dependencies
RUN apt-get update && apt-get install -y \
    libmapnik-dev libmapnik3.1 mapnik-utils python3 python3-mapnik \
    node-gyp build-essential python3-dev

# Install mapnik globally first
RUN npm install -g mapnik --build-from-source

# Install mapeo-settings-builder with specific dependencies
RUN npm install -g mapeo-settings-builder --unsafe-perm

# Create a test script to verify mapnik is working
RUN echo 'console.log("Testing mapnik..."); try { require("mapnik"); console.log("Mapnik loaded successfully"); } catch(e) { console.error(e); process.exit(1); }' > /tmp/test-mapnik.js

# Run the test script
RUN node /tmp/test-mapnik.js

# Verify mapeo-settings-builder installation
RUN mapeo-settings-builder --version || (echo "mapeo-settings-builder installation failed" && exit 1)
# Set the working directory in the container
WORKDIR /app

# Copy package.json and bun.lockb (if exists)
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Build the application
RUN bun run build

# Command to run the application
CMD ["bun", "run", "start"]