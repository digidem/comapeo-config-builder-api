# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the CoMapeo Config Builder API v2.0.0.

## What are ADRs?

Architecture Decision Records document important architectural decisions made during the development of this project, including:
- The context and problem being solved
- The decision made and why
- The consequences (positive and negative)
- Alternatives considered and why they were rejected

## Index

### API Design
- [ADR 001: JSON API over ZIP Upload](./001-json-api-over-zip-upload.md) - Why we moved from ZIP uploads to JSON-first API

### System Architecture
- [ADR 002: Stateless Design Without Database](./002-stateless-design.md) - Why we chose a stateless architecture with no persistent storage

### Technology Choices
- [ADR 003: Elysia Framework for Bun Runtime](./003-elysia-framework-for-bun.md) - Why we chose Elysia as the web framework
- [ADR 004: Prometheus Metrics Format](./004-prometheus-metrics-format.md) - Why we expose Prometheus-format metrics

## ADR Status

- **Accepted**: Decision is approved and implemented
- **Proposed**: Decision is under consideration
- **Deprecated**: Decision is no longer relevant
- **Superseded**: Replaced by a newer ADR

## Template

When creating new ADRs, use this template:

```markdown
# ADR XXX: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
What is the problem we're trying to solve? What constraints exist?

## Decision
What did we decide to do and why?

## Consequences
### Positive:
- Benefits of this decision

### Negative:
- Drawbacks or limitations

### Mitigation:
- How we address the negative consequences

## Alternatives Considered
What other options did we evaluate and why did we reject them?

## References
- Links to code, docs, or external resources
```

## Contributing

When making significant architectural changes:
1. Create a new ADR in this directory
2. Number it sequentially (ADR 005, ADR 006, etc.)
3. Update this README index
4. Get it reviewed before implementing

## Related Documentation

- [Architecture Overview](../context/architecture.md) - High-level system architecture
- [API Documentation](../context/api.md) - API endpoints and usage
- [Deployment Guide](../context/deployment.md) - How to deploy the service
