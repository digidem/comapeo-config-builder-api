# Deployment Documentation

## Overview

The CoMapeo Config Builder API can be deployed in multiple ways:
1. **Docker Container** (recommended)
2. **Bare Metal / VM** with Bun runtime
3. **GitHub Container Registry** (GHCR)

---

## Docker Deployment

### Dockerfile

**Location**: `Dockerfile`

#### Build Configuration

```dockerfile
# Base image: Node.js 24 (LTS) on Debian Bookworm
FROM node:24-bookworm-slim

# Install system dependencies for mapnik
RUN apt-get update && apt-get install -yq \
  libasound2 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libexpat1 \
  libfontconfig1 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 \
  libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
  libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 \
  libxrender1 libxss1 libxtst6 ca-certificates \
  fonts-liberation lsb-release xdg-utils wget bzip2 && \
  rm -rf /var/lib/apt/lists/*

# Install Bun runtime (pinned version)
RUN npm install -g bun@1.3.2

# Install mapeo-settings-builder CLI globally
RUN npm install -g mapeo-settings-builder

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy application code
COPY . .

# Expose HTTP port
EXPOSE 3000

# Start application
CMD ["bun", "run", "index.ts"]
```

#### Why Node Base Image?

The official Bun Docker image is not used because `mapeo-settings-builder` depends on `mapnik`, which requires specific native libraries only available in the Node.js image.

---

### Building Docker Image

#### Local Build

```bash
docker build -t comapeo-config-builder-api:local .
```

#### Production Build

```bash
docker build \
  --platform linux/amd64 \
  -t comapeo-config-builder-api:latest \
  .
```

#### Multi-Platform Build

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t comapeo-config-builder-api:latest \
  --push \
  .
```

---

### Running Docker Container

#### Basic Run

```bash
docker run -p 3000:3000 comapeo-config-builder-api:local
```

#### With Environment Variables

```bash
docker run \
  -p 8080:8080 \
  -e PORT=8080 \
  comapeo-config-builder-api:local
```

#### With Volume Mounts (Debugging)

```bash
docker run \
  -p 3000:3000 \
  -v /tmp/docker-builds:/tmp \
  comapeo-config-builder-api:local
```

**Purpose**: Inspect temporary build artifacts

#### Production Run

```bash
docker run -d \
  --name comapeo-api \
  --restart unless-stopped \
  -p 3000:3000 \
  -e PORT=3000 \
  comapeo-config-builder-api:latest
```

**Flags**:
- `-d`: Run in detached mode
- `--name`: Container name
- `--restart unless-stopped`: Auto-restart on failure
- `-p`: Port mapping

---

### Docker Compose (Optional)

**Example `docker-compose.yml`**:

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

**Run with Docker Compose**:
```bash
docker-compose up -d
```

---

## GitHub Container Registry (GHCR)

### Publishing to GHCR

**Workflow Location**: `.github/workflows/deploy.yml`

#### Workflow Steps

1. **Test Phase**:
   - Setup Bun
   - Install dependencies
   - Run TypeScript type checking
   - Run tests
   - Run linting

2. **Docker Build Phase** (only after tests pass):
   - Setup QEMU for multi-platform builds
   - Setup Docker Buildx
   - Login to Docker Hub
   - Build and push image
   - Update Docker Hub description

#### Workflow Configuration

```yaml
name: Release on Docker Hub

on:
  push:
    branches:
      - 'main'

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run TypeScript type checking
        run: bun tsc --noEmit

      - name: Run tests
        run: bun test

      - name: Run linting
        run: bun run lint

  docker:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          push: true
          platforms: linux/amd64
          tags: communityfirst/comapeo-config-builder-api:latest

      - name: Docker Hub Description
        uses: peter-evans/dockerhub-description@v4
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
          repository: communityfirst/comapeo-config-builder-api
          short-description: ${{ github.event.repository.description }}
```

#### Required Secrets

Configure in GitHub repository settings:
- `DOCKERHUB_USERNAME`: Docker Hub username
- `DOCKERHUB_TOKEN`: Docker Hub access token

---

### Pulling from Docker Hub

```bash
# Pull latest image
docker pull communityfirst/comapeo-config-builder-api:latest

# Run pulled image
docker run -p 3000:3000 communityfirst/comapeo-config-builder-api:latest
```

---

## Bare Metal Deployment

### Prerequisites

1. **Install Bun** (v1.3.2):
```bash
curl -fsSL https://bun.sh/install | bash
# Or specific version
npm install -g bun@1.3.2
```

2. **Install mapeo-settings-builder**:
```bash
npm install -g mapeo-settings-builder
```

3. **System Dependencies** (for mapeo-settings-builder):
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y \
  libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev \
  build-essential g++ libpng-dev

# macOS
brew install cairo pango libpng jpeg giflib
```

### Installation Steps

1. **Clone repository**:
```bash
git clone https://github.com/digidem/comapeo-config-builder-api.git
cd comapeo-config-builder-api
```

2. **Install dependencies**:
```bash
bun install
```

3. **Build application** (optional):
```bash
bun run build
```

4. **Run application**:
```bash
# Development mode
bun run dev

# Production mode
bun run start
```

---

### Process Management

#### Using systemd (Linux)

**Create service file**: `/etc/systemd/system/comapeo-api.service`

```ini
[Unit]
Description=CoMapeo Config Builder API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/comapeo-config-builder-api
Environment="PORT=3000"
ExecStart=/usr/local/bin/bun run /opt/comapeo-config-builder-api/src/index.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Enable and start**:
```bash
sudo systemctl enable comapeo-api
sudo systemctl start comapeo-api
sudo systemctl status comapeo-api
```

#### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/index.ts --interpreter bun --name comapeo-api

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup
```

---

## CI/CD Workflows

### 1. Deploy Workflow

**File**: `.github/workflows/deploy.yml`

**Triggers**:
- Push to `main` branch

**Jobs**:
1. **Test**: Run all tests and type checking
2. **Docker**: Build and push Docker image

---

### 2. Docker Test Workflow

**File**: `.github/workflows/docker-test.yml`

**Triggers**:
- Push to `main` branch
- Pull requests to `main` branch

**Jobs**:
1. **Test**: Build Docker image and test with real API requests

**Script**: `scripts/test-mapeo-config.sh`

---

## Environment Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `BUN_ENV` | - | Environment mode (test, development, production) |

### Setting Environment Variables

**Docker**:
```bash
docker run -e PORT=8080 comapeo-config-builder-api
```

**Bare Metal**:
```bash
PORT=8080 bun run start
```

**systemd**:
```ini
Environment="PORT=8080"
```

**PM2**:
```bash
PORT=8080 pm2 start src/index.ts --interpreter bun
```

---

## Health Checks

### Health Endpoint

```bash
curl http://localhost:3000/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-20T12:34:56.789Z"
}
```

### Docker Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

### Kubernetes Liveness/Readiness Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

---

## Monitoring and Logging

### Logs

**Docker**:
```bash
# View logs
docker logs comapeo-api

# Follow logs
docker logs -f comapeo-api

# Last 100 lines
docker logs --tail 100 comapeo-api
```

**systemd**:
```bash
sudo journalctl -u comapeo-api -f
```

**PM2**:
```bash
pm2 logs comapeo-api
```

### Log Format

Application logs are written to stdout:

```
Temporary directory created: /tmp/comapeo-settings-abc123
Building settings in: /tmp/comapeo-settings-abc123/build/config-1.0.0.comapeocat
Waiting for .comapeocat file...
.comapeocat file found: /tmp/comapeo-settings-abc123/build/config-1.0.0.comapeocat
```

---

## Scaling

### Horizontal Scaling

The API is **stateless** and can be horizontally scaled:

#### Load Balancer Configuration

```nginx
upstream comapeo_api {
  server 10.0.0.1:3000;
  server 10.0.0.2:3000;
  server 10.0.0.3:3000;
}

server {
  listen 80;
  server_name api.example.com;

  location / {
    proxy_pass http://comapeo_api;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

#### Docker Swarm

```bash
docker service create \
  --name comapeo-api \
  --replicas 3 \
  --publish 3000:3000 \
  communityfirst/comapeo-config-builder-api:latest
```

#### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: comapeo-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: comapeo-api
  template:
    metadata:
      labels:
        app: comapeo-api
    spec:
      containers:
      - name: api
        image: communityfirst/comapeo-config-builder-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: PORT
          value: "3000"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
```

---

## Security Considerations

### Production Checklist

- [ ] Use HTTPS (SSL/TLS certificates)
- [ ] Implement authentication
- [ ] Add rate limiting
- [ ] Set up CORS properly (restrict origins)
- [ ] Add request size limits
- [ ] Enable security headers
- [ ] Regular security audits (`bun run audit`)
- [ ] Keep dependencies updated
- [ ] Use secrets management (not environment variables in code)
- [ ] Implement logging and monitoring
- [ ] Set up alerting

### Reverse Proxy Configuration

**Nginx Example**:

```nginx
server {
  listen 443 ssl http2;
  server_name api.example.com;

  ssl_certificate /etc/ssl/certs/api.example.com.crt;
  ssl_certificate_key /etc/ssl/private/api.example.com.key;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;

  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
  limit_req zone=api burst=20;

  # Client body size limit
  client_max_body_size 100M;

  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## Rollback Procedures

### Docker Rollback

```bash
# Tag current version before deployment
docker tag comapeo-config-builder-api:latest comapeo-config-builder-api:v1.0.0

# If new version has issues, revert
docker tag comapeo-config-builder-api:v1.0.0 comapeo-config-builder-api:latest
docker stop comapeo-api
docker rm comapeo-api
docker run -d --name comapeo-api -p 3000:3000 comapeo-config-builder-api:latest
```

### Git Rollback

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or reset to specific commit (destructive)
git reset --hard <commit-hash>
git push --force origin main
```

---

## Troubleshooting

### Common Issues

**Issue**: Container fails to start

```bash
# Check logs
docker logs comapeo-api

# Common causes:
# - Port already in use
# - Missing environment variables
# - Insufficient permissions
```

**Issue**: Build process times out

```bash
# Increase timeout in config
# Edit src/config/app.ts
maxAttempts: 300  # 5 minutes instead of 2
```

**Issue**: mapeo-settings-builder not found

```bash
# Verify installation
docker exec comapeo-api which mapeo-settings-builder

# Reinstall if needed
docker exec comapeo-api npm install -g mapeo-settings-builder
```

---

## Performance Optimization

### Recommendations

1. **Resource Limits**: Set CPU/memory limits
2. **Caching**: Add caching layer for repeated requests
3. **Compression**: Enable gzip compression in reverse proxy
4. **CDN**: Use CDN for static assets (if added)
5. **Connection Pooling**: Use keep-alive connections
6. **Monitoring**: Track response times and resource usage
