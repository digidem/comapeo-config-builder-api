# ADR 004: Prometheus Metrics Format

## Status

Accepted

## Context

For production monitoring and observability, we need to expose operational metrics. Requirements:
1. Track request latency, error rates, build success/failure
2. Enable alerting on degraded performance
3. Support integration with common monitoring stacks
4. Minimal overhead on request handling
5. No external dependencies (no agents, collectors)

Metrics format options:
- **Prometheus**: Text-based, pull model, industry standard
- **StatsD**: UDP-based, push model, requires agent
- **OpenTelemetry**: Complex SDK, requires collector
- **Custom JSON**: Simple but no tooling support

## Decision

We will implement **Prometheus-format metrics** exposed via `GET /metrics` endpoint.

### Format Example:
```prometheus
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{endpoint="/build",status="200"} 1234

# HELP http_request_duration_ms HTTP request duration in milliseconds
# TYPE http_request_duration_ms summary
http_request_duration_ms{endpoint="/build",quantile="0.5"} 150
http_request_duration_ms{endpoint="/build",quantile="0.9"} 500
http_request_duration_ms{endpoint="/build",quantile="0.95"} 750
http_request_duration_ms{endpoint="/build",quantile="0.99"} 1200
http_request_duration_ms_sum{endpoint="/build"} 187500
http_request_duration_ms_count{endpoint="/build"} 1234
```

### Implementation:
- **MetricsCollector** class with in-memory storage
- **Automatic middleware** tracks all HTTP requests
- **Build metrics** recorded in build controller
- **Rate limit hits** tracked in rate limit middleware
- **Memory-safe**: Limits stored samples to prevent unbounded growth

### Collected Metrics:

**HTTP Metrics**:
- `http_requests_total{endpoint, status}` - Request count
- `http_request_duration_ms{endpoint, quantile}` - Latency percentiles
- `http_requests_active` - Current active requests

**Build Metrics**:
- `build_operations_total{result}` - success/failure/validation_error
- `build_duration_ms{quantile}` - Build time percentiles

**System Metrics**:
- `app_uptime_seconds` - Application uptime
- `process_memory_bytes{type}` - Memory usage
- `rate_limit_hits_total` - Rate limit violations

## Consequences

### Positive:

**Industry Standard**:
- Prometheus is de facto standard for metrics
- Supported by all major monitoring platforms (Grafana, Datadog, New Relic)
- Well-understood semantics (counters, gauges, histograms)

**Simple Integration**:
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'comapeo-api'
    static_configs:
      - targets: ['localhost:3000']
```
- Pull model (Prometheus scrapes /metrics)
- No agent required in application
- Works with service discovery

**Operational Benefits**:
- Percentile latency tracking (p50, p90, p95, p99)
- Historical data for capacity planning
- Alerting on SLO violations
- Dashboard creation (Grafana)

**Performance**:
- Text format is fast to generate
- No network calls from application
- Minimal memory overhead (~1KB per 1000 requests)
- Non-blocking metrics collection

**Developer Experience**:
```typescript
// Automatic tracking via middleware
metrics.recordRequest(endpoint, status, duration)

// Manual tracking in specific code
metrics.recordBuild(success, duration, isValidationError)
```
- Simple API
- Type-safe
- Unit testable

### Negative:

**Memory Usage**:
- Stores samples in memory (limited to 1000 per endpoint)
- High-cardinality labels could cause issues
- No persistence across restarts

**Pull Model Limitations**:
- Prometheus must be able to reach the service
- Short-lived services lose metrics
- Not suitable for serverless (no persistent endpoint)

**Format Constraints**:
- Text format less efficient than binary (Protocol Buffers)
- Label cardinality limits (can't have unique IDs)
- No nested structures

### Mitigation:

**For memory concerns**:
- Circular buffer limits samples to 1000
- Low cardinality labels (endpoint, status)
- Periodic scraping clears old data

**For pull model**:
- Not an issue for long-running API server
- Kubernetes/Docker expose ports automatically
- Could add push gateway if needed later

**For format**:
- Text format adequate for our volume (<1MB metrics)
- Label cardinality controlled (only endpoint and status)
- Histograms provide statistical summaries

## Alternatives Considered

### Alternative 1: StatsD + Graphite
```typescript
const StatsD = require('node-statsd')
const client = new StatsD()
client.timing('api.request', duration)
```

**Rejected because**:
- Requires external agent (statsd daemon)
- Push model increases application complexity
- UDP can lose metrics
- Less common in modern stacks

### Alternative 2: OpenTelemetry
```typescript
import { metrics } from '@opentelemetry/api'
const meter = metrics.getMeter('comapeo-api')
const counter = meter.createCounter('http_requests')
counter.add(1, { endpoint: '/build' })
```

**Rejected because**:
- Heavy SDK dependency
- Requires collector setup
- Over-engineered for simple use case
- Adds significant complexity

### Alternative 3: Custom JSON Endpoint
```json
GET /metrics
{
  "requests": { "/build": { "200": 1234 } },
  "latency": { "/build": { "p50": 150, "p99": 1200 } }
}
```

**Rejected because**:
- No standard tooling support
- Would need to build dashboards from scratch
- No alerting integrations
- Reinventing the wheel

### Alternative 4: Application Performance Monitoring (APM) SaaS
- Datadog APM
- New Relic
- AppDynamics

**Rejected because**:
- Vendor lock-in
- Cost for high volume
- External dependency
- Privacy concerns (sends data externally)

## Usage Example

### Prometheus Configuration:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'comapeo-api'
    static_configs:
      - targets: ['comapeo-api:3000']
    metrics_path: /metrics
```

### Grafana Dashboard:
```promql
# Request rate
rate(http_requests_total[5m])

# Latency p99
http_request_duration_ms{quantile="0.99"}

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Build success rate
rate(build_operations_total{result="success"}[5m]) /
rate(build_operations_total[5m])
```

### Alert Rules:
```yaml
groups:
  - name: comapeo_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        annotations:
          summary: "Error rate above 5%"

      - alert: HighLatency
        expr: http_request_duration_ms{quantile="0.99"} > 5000
        annotations:
          summary: "p99 latency above 5 seconds"
```

## Future Enhancements

**Possible additions**:
- Request size distribution
- Response size distribution
- Geographic breakdown (if using geo-headers)
- Per-user metrics (if authentication added)
- Cache hit rates (if caching added)

**Not planned** (complexity vs value):
- Distributed tracing (OpenTelemetry)
- Profiling integration
- Custom metrics SDK for business logic

## References

- Prometheus docs: https://prometheus.io/docs/
- Metrics controller: `src/controllers/metricsController.ts`
- Metrics middleware: `src/middleware/metricsMiddleware.ts`
- Integration: `src/app.ts`
