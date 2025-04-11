# Use the official Bun image as the base
FROM node:18-bullseye-slim

# Set environment variables
ARG CI=false
ENV CI=$CI

RUN apt-get update && apt-get install -yq gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
  libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
  libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
  libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
  ca-certificates fonts-liberation libnss3 lsb-release xdg-utils wget bzip2

RUN npm install -g bun@1.0.16

# Install mapeo-settings-builder and verify it's working
RUN npm install -g mapeo-settings-builder && \
    echo "Verifying mapeo-settings-builder installation..." && \
    mapeo-settings-builder --version && \
    echo "mapeo-settings-builder installed successfully"
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
