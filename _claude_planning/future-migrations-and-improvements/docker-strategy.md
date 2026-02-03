# Docker Containerization Strategy

> *This document was generated with Claude Code on 2025-12-28.*

This document outlines the Docker containerization strategy for the Troupe project.

## Current State

### Existing Dockerfile

The project has a working multi-stage Dockerfile that:
- Uses `node:slim` as base image
- Installs `haskell-stack` for compiler builds
- Builds compiler, runtime, P2P tools, and libraries
- Creates a minimal runner image

### Current Dependencies
- **Node.js**: Slim base (version determined by node:slim tag)
- **Haskell**: Stack-based build with GHC 9.10.x (lts-24.1)
- **libp2p**: v3.0.0 (already upgraded to modern version)

## Improvement Opportunities

### 1. Base Image Updates

Consider updating base images for security and performance:

```dockerfile
# Current
FROM node:slim AS base

# Potential improvement
FROM node:22-slim AS base  # Explicit LTS version
```

### 2. Multi-Container Architecture

For different use cases, specialized containers could be created:

| Container Type     | Purpose                              | Target Size |
|--------------------|--------------------------------------|-------------|
| `troupe-dev`       | Full development environment         | 2-3GB       |
| `troupe-ci-fast`   | Core tests only (skip multinode)     | 500MB-1GB   |
| `troupe-ci-full`   | Complete testing including multinode | 1-2GB       |
| `troupe-runtime`   | Minimal production deployment        | 200-400MB   |

### 3. Build Optimization

**Layer Caching Strategy**:
```dockerfile
# Copy package files first for better caching
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy source code last
COPY . .
RUN npm run build
```

### 4. Multinode Testing Support

Docker Compose can orchestrate multinode tests:

```yaml
services:
  relay:
    image: troupe-ci-full:latest
    command: ["node", "p2p-tools/built/relay/relay.mjs", "--port", "5555"]
    healthcheck:
      test: ["CMD", "nc", "-z", "localhost", "5555"]

  node1:
    image: troupe-ci-full:latest
    depends_on:
      relay:
        condition: service_healthy
```

### 5. Security Improvements

- Run containers as non-root user
- Add health checks for orchestration
- Implement vulnerability scanning

```dockerfile
# Create app user for security
RUN addgroup -g 1001 -S troupe && \
    adduser -S troupe -u 1001
USER troupe

HEALTHCHECK --interval=30s --timeout=3s \
    CMD troupec --version || exit 1
```

## Implementation Dependencies

Before major Docker changes, consider:
1. **Cabal Migration** (optional) - Would simplify Haskell build in containers
2. **CI/CD Integration** - Containers should align with CI workflow

## Current Dockerfile Analysis

The existing Dockerfile is functional. Key observations:
- Multi-stage build reduces final image size
- Includes multinode test dependencies (procps, jq)
- Copies comprehensive test infrastructure

## Next Steps

1. Pin Node.js version explicitly in base image
2. Add development-focused container variant
3. Implement Docker Compose for local multinode testing
4. Add container security hardening
5. Integrate with GitHub Container Registry
