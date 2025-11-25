# Use the latest Node.js LTS 24 on Debian Bookworm
FROM node:24-bookworm-slim

# Install system dependencies required by mapnik/CLI tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
  libasound2 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libexpat1 \
  libfontconfig1 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
  libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
  libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
  ca-certificates fonts-liberation lsb-release xdg-utils wget bzip2 \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g bun@1.3.2
RUN npm install -g mapeo-settings-builder
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

# Command to run the application
CMD ["bun", "run", "index.ts"]
