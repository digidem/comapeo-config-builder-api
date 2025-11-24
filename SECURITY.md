# Security Policy

## Reporting Security Issues

If you discover a security vulnerability, please email the maintainers at [security contact email]. Do not open public GitHub issues for security vulnerabilities.

## Security Features

### Request Body Size Protection (Defense in Depth)

The API implements multiple layers of protection against memory exhaustion attacks:

#### Layer 1: Framework-Level Limit (50 MB)
- **Location**: `src/app.ts`
- **Enforcement**: Elysia framework configuration
- **Purpose**: Baseline protection for all requests
- **Error**: `413 Payload Too Large` with `BODY_SIZE_EXCEEDED` code

#### Layer 2: Content-Length Pre-Check
- **Location**: `src/controllers/buildController.ts:138-149`
- **Enforcement**: Before body read
- **Limits**:
  - JSON mode: 10 MB
  - ZIP mode: 50 MB
- **Purpose**: Fast rejection before resource allocation
- **Error**: `413 Payload Too Large`

#### Layer 3: Parsed Body Validation (CRITICAL)
- **Location**: `src/controllers/buildController.ts:217-226`
- **Enforcement**: After JSON parsing
- **Purpose**: Prevents chunked upload bypass attacks
- **Details**: Measures serialized JSON size using `Buffer.byteLength(JSON.stringify(parsedBody))`
- **Security Fix**: Patches vulnerability where chunked uploads without `Content-Length` headers could bypass size limits
- **Error**: `413 Payload Too Large`

#### Layer 4: ZIP Streaming with Size Enforcement
- **Location**: `src/controllers/buildController.ts:55-119`
- **Enforcement**: During body read
- **Purpose**: Chunk-by-chunk size validation for ZIP uploads
- **Error**: `PayloadTooLarge` exception

### Attack Vector Mitigated

**Vulnerability**: JSON requests with chunked transfer encoding could bypass Content-Length checks since Elysia pre-parses the body.

**Attack Example**:
```http
POST /build HTTP/1.1
Content-Type: application/json
Transfer-Encoding: chunked

[... unlimited JSON data ...]
```

**Fix**: All parsed JSON bodies are measured post-parsing to ensure they don't exceed the 10 MB limit, regardless of how they were received.

### Rate Limiting

- **Status**: Implemented (optional, enabled by default)
- **Configuration**: Environment variable `RATE_LIMIT_ENABLED`
- **Details**: See `src/middleware/rateLimit.ts`

### Input Validation

- **JSON Schema Validation**: `src/validators/schema.ts`
- **Metadata Validation**: Required fields enforced
- **File Type Validation**: ZIP structure verification
- **Path Traversal Protection**: Sanitized filenames using `path.basename()`

### Timeout Protection

- **Request Timeout**: 5 minutes (configurable via `TIMEOUT_MS`)
- **Build Timeout**: 2 minutes (120 polling attempts)
- **Implementation**: `src/middleware/timeout.ts`

### SSRF Protection

- **URL Validation**: `src/utils/urlValidator.ts`
- **Blocked Ranges**:
  - Private IPv4: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`
  - Link-local: `169.254.0.0/16`
  - Private IPv6: `fc00::/7`, `fe80::/10`, `::1/128`
  - IPv6 ULA: `fd00::/8` (CVE-2024-XXXXX fix)
- **Scheme Whitelist**: Only `http://` and `https://` allowed

## Security Best Practices

### For Production Deployments

1. **Enable Rate Limiting**: Set `RATE_LIMIT_ENABLED=true`
2. **Use Reverse Proxy**: Deploy behind nginx/Traefik with proper `x-forwarded-for` headers
3. **Implement Authentication**: The API currently has no authentication
4. **Enable HTTPS**: Use TLS/SSL certificates
5. **Set Resource Limits**: Configure Docker/Kubernetes memory limits
6. **Monitor Metrics**: Use `/metrics` endpoint for Prometheus monitoring
7. **Regular Updates**: Keep dependencies updated (`bun update`)

### Environment Variables

Security-related environment variables:

```bash
# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10

# Timeouts
TIMEOUT_MS=300000
REQUEST_TIMEOUT_MS=300000

# Metrics
METRICS_ENABLED=true

# Logging (avoid sensitive data)
LOG_LEVEL=info
```

## Security Changelog

### 2025-01-24: Body Size Validation Enhancement
- **Issue**: JSON requests with chunked encoding could bypass size limits
- **Fix**: Added post-parsing size validation for all JSON bodies
- **Impact**: Prevents memory exhaustion attacks via chunked uploads
- **Files Modified**:
  - `src/app.ts`: Added framework-level body size limit
  - `src/controllers/buildController.ts`: Added parsed body size check
  - `src/tests/integration/build.test.ts`: Added security tests
- **Test Coverage**: 3 new tests verify the fix

### Previous Security Fixes

See git commit history for full security changelog.

## Security Testing

### Running Security Tests

```bash
# Run all tests
bun test

# Run specific security tests
bun test -t "should reject oversized JSON body"
bun test -t "should handle framework-level body size limit"

# Run integration tests
bun run test:integration
```

### Manual Security Testing

Test body size limits:
```bash
# Test oversized JSON (should fail with 413)
curl -X POST http://localhost:3000/build \
  -H "Content-Type: application/json" \
  -H "Content-Length: 20000000" \
  -d '{"metadata":{"name":"test","version":"1.0.0"}}'

# Test valid JSON (should succeed or fail validation)
curl -X POST http://localhost:3000/build \
  -H "Content-Type: application/json" \
  -d '{"metadata":{"name":"test","version":"1.0.0"},"categories":[],"fields":[]}'
```

## Dependency Security

### Automated Scanning

Dependencies are scanned for vulnerabilities using:
- GitHub Dependabot (enabled)
- `npm audit` / `bun audit`

### Update Policy

- Critical vulnerabilities: Immediate update
- High vulnerabilities: Within 7 days
- Medium/Low: Regular maintenance updates

### Known Issues

Check GitHub Security Advisories for current known issues.

## Contact

For security concerns, contact: [security contact email]

## Acknowledgments

We appreciate responsible disclosure of security vulnerabilities.
