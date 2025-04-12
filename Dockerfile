# Use the official Bun image as the base
FROM node:18-bullseye-slim

# Set environment variables
ARG CI=false
ENV CI=$CI
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

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

# Install dependencies for mapeo-settings-builder
RUN apt-get update && apt-get install -y \
    libmapnik-dev libmapnik3.1 mapnik-utils python3 python3-mapnik \
    node-gyp build-essential python3-dev libcairo2-dev libjpeg-dev libgif-dev

# Install mapeo-settings-builder with specific dependencies
RUN npm install -g mapeo-settings-builder --unsafe-perm

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