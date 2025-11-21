# ADR 002: Stateless Design Without Database

## Status

Accepted

## Context

As a configuration builder API, we need to decide whether to:
1. Store build history, user data, or configuration state in a database
2. Implement job queuing for long-running builds
3. Track build progress or status

Options considered:
- **Stateful with DB**: PostgreSQL/SQLite for build history, job status
- **Stateless**: No database, synchronous request/response
- **Hybrid**: Queue for async builds, database for status tracking

## Decision

We will implement a **fully stateless API** with no database dependency.

### Characteristics:
1. **No persistent storage**: Builds are processed and returned immediately
2. **No session state**: Each request is independent
3. **Ephemeral temp files**: Cleaned up after each build
4. **No build history**: Clients responsible for storing .comapeocat files
5. **Synchronous processing**: Request blocks until build completes or times out

### Request lifecycle:
```
Client → POST /build → Validate → Build → Return .comapeocat → Cleanup
```

## Consequences

### Positive:

**Simplicity**:
- No database setup/migrations/backups
- No connection pooling or ORM complexity
- Simpler deployment (single container)
- No data consistency concerns

**Scalability**:
- Horizontal scaling trivial (no shared state)
- Can run multiple instances behind load balancer
- No database bottleneck
- Auto-scaling based on CPU/memory only

**Reliability**:
- No database failure mode
- No data corruption issues
- Stateless restart (no recovery needed)
- Easier disaster recovery (just redeploy)

**Operations**:
- Simpler monitoring (no DB metrics)
- Faster deployments (no DB migrations)
- Lower infrastructure cost
- Easier local development

### Negative:

**Functionality limitations**:
- No build history/analytics without external logging
- Can't query "all builds in last hour"
- No retry mechanism (client must retry)
- Can't resume failed builds

**Performance implications**:
- Long builds block the HTTP connection
- No async/callback pattern
- Client timeout must exceed build timeout

**Observability challenges**:
- Build metrics require external aggregation
- No centralized audit log
- Tracing requires external APM

### Mitigation:

**For long builds**:
- Implemented 5-minute request timeout (configurable)
- Graceful shutdown prevents dropped requests
- Structured logging captures build details

**For analytics**:
- Prometheus metrics endpoint (`/metrics`) provides operational data
- Structured JSON logs can be aggregated (ELK, Loki)
- Health checks show system status

**For reliability**:
- Comprehensive validation prevents wasted builds
- Clear error messages help debugging
- Timeout prevents hung requests

## Alternatives Considered

### Alternative 1: PostgreSQL + Job Queue
```
POST /build → Queue → Worker → Store result → Poll for status
```

**Rejected because**:
- Over-engineered for use case (builds complete in <10 seconds typically)
- Adds operational complexity (database, job processor)
- Requires status polling API
- Doesn't significantly improve UX

### Alternative 2: SQLite for History
```
Keep stateless builds, add opt-in SQLite for build history
```

**Rejected because**:
- Minimal value (logs provide same info)
- Breaks stateless property
- Complicates horizontal scaling
- History can be built from metrics/logs

## References

- Build timeout: `src/middleware/timeout.ts`
- Metrics collection: `src/controllers/metricsController.ts`
- Structured logging: `src/utils/logger.ts`
- Deployment: `docs/deployment.md`
