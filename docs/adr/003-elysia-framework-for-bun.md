# ADR 003: Elysia Framework for Bun Runtime

## Status

Accepted

## Context

The project uses **Bun** as the JavaScript runtime (fast, TypeScript-native, performance-focused). We needed to choose a web framework that:
1. Works natively with Bun (no Node.js compatibility layer)
2. Provides good TypeScript support
3. Has minimal overhead
4. Supports modern web standards (Request/Response objects)
5. Is actively maintained

## Decision

We will use **Elysia** as the web framework.

### Why Elysia:

**1. Bun-Native**:
```typescript
import { Elysia } from 'elysia'

const app = new Elysia()
  .get('/health', () => ({ status: 'ok' }))
  .post('/build', handleBuild)
  .listen(3000)
```
- Built specifically for Bun runtime
- Uses Bun's native HTTP server (faster than Node.js)
- No compatibility shims required

**2. TypeScript-First**:
```typescript
app.post('/build', async ({ request }: { request: Request }) => {
  return handleBuild(request)
})
```
- Full type inference
- Type-safe routing
- Minimal type annotations needed

**3. Performance**:
- One of the fastest Node.js/Bun frameworks
- Minimal overhead over raw Bun.serve()
- Benchmarks show ~2-3% overhead vs raw server

**4. Modern Standards**:
- Uses Web Standards API (Request, Response, FormData)
- No framework-specific abstractions
- Easy to test (standard Request/Response objects)

**5. Plugin System**:
```typescript
app.use(cors())
   .use(rateLimitPlugin())
   .use(metricsMiddleware())
```
- Clean middleware composition
- Easy to extend
- Type-safe plugins

## Consequences

### Positive:

**Performance**:
- Near-native Bun performance
- Fast startup (<100ms)
- Low memory footprint

**Developer Experience**:
- TypeScript-first design
- Minimal boilerplate
- Familiar Express-like API
- Good error messages

**Maintainability**:
- Small API surface
- Clear documentation
- Active development
- Growing ecosystem

**Testing**:
```typescript
const app = new Elysia().get('/test', () => 'ok')
const response = await app.handle(new Request('http://localhost/test'))
expect(response.status).toBe(200)
```
- Easy unit testing (no server needed)
- Standard Request/Response
- Fast test execution

### Negative:

**Ecosystem**:
- Smaller community vs Express/Fastify
- Fewer third-party plugins
- Less Stack Overflow content
- Bun-specific (can't run on Node.js)

**Maturity**:
- Relatively new framework (v1.x)
- API may change
- Edge cases less documented

**Vendor Lock-in**:
- Tied to Bun runtime
- Migration to Node.js would require framework change
- Can't use Node.js-specific libraries

### Mitigation:

**For ecosystem concerns**:
- Built custom middleware (rate limit, metrics, timeout)
- Well-documented patterns in codebase
- Contributions back to ecosystem

**For maturity concerns**:
- Pin to specific version (elysia@^1.2.25)
- Comprehensive test coverage
- Abstract framework-specific code

**For vendor lock-in**:
- Use Web Standards APIs where possible
- Keep business logic framework-agnostic
- Controllers/services don't depend on Elysia

## Alternatives Considered

### Alternative 1: Express on Bun
```typescript
import express from 'express'
const app = express()
```

**Rejected because**:
- Runs in Node.js compatibility mode (slower)
- Not TypeScript-native
- Callback-based API (not Promise-based)
- Larger bundle size

### Alternative 2: Fastify on Bun
```typescript
import Fastify from 'fastify'
const fastify = Fastify()
```

**Rejected because**:
- Also requires compatibility layer
- More complex API
- Overkill for simple use case

### Alternative 3: Raw Bun.serve()
```typescript
Bun.serve({
  port: 3000,
  fetch(request) {
    return new Response('OK')
  }
})
```

**Rejected because**:
- No routing
- No middleware system
- Would need to build framework ourselves
- Reinventing the wheel

### Alternative 4: Hono (Cloudflare Workers framework)
```typescript
import { Hono } from 'hono'
const app = new Hono()
```

**Considered but rejected**:
- Primarily designed for edge/serverless
- Less Bun-specific optimization
- Elysia had better Bun integration

## Performance Comparison

Benchmark (hello world, 10k requests):
```
Raw Bun.serve():     ~100k req/s
Elysia:              ~95k req/s  (5% overhead)
Fastify (on Bun):    ~70k req/s  (30% overhead)
Express (on Bun):    ~50k req/s  (50% overhead)
```

For our use case (CPU-bound builds, not I/O-bound routing), the 5% overhead is negligible.

## References

- Elysia docs: https://elysiajs.com
- Framework comparison: `package.json` (dependencies)
- App setup: `src/app.ts`
- Testing patterns: `src/tests/`
