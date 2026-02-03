# CI/CD Pipeline Documentation

> *This document was generated with Claude Code on 2025-12-28.*

This document describes the CI/CD infrastructure for the Troupe project.

## Current State

### GitHub Actions Workflows

The project has working CI/CD:

- **`run_tests.yml`** - Comprehensive test execution on Ubuntu 24.04
- **`build_docker_image.yml`** - Docker image building and publishing

### Current CI Configuration

```yaml
runs-on: ubuntu-24.04
env:
  STACK_OPTS: "--system-ghc"
  TROUPE: ${{github.workspace}}

# Key setup:
- GHC: 9.12.2 (via haskell-actions/setup)
- Node.js: 22 (via actions/setup-node)
- Stack: enabled for Haskell builds
```

### Build Process

The CI executes this build sequence:
1. `make compiler` - Build Haskell compiler
2. `make rt` - Build TypeScript runtime
3. `make libs` - Compile standard libraries
4. `make service` - Compile service module
5. `make p2p-tools` - Build P2P tools
6. `make test` - Run test suite

### Test Infrastructure

- **Golden test framework** with 300+ tests
- **Test categories**:
  - Compiler tests (`/tests/cmp/`)
  - Runtime tests (`/tests/rt/pos/`, `/tests/rt/neg/`)
  - IFC tests (`/tests/rt/pos/ifc/`)
  - Multinode tests (`/tests/rt/multinode-tests/`)

### Caching Strategy

Current CI caches:
- GHC installation (`~/.ghcup`)
- Stack dependencies (`~/.stack`, `.stack-work`)
- Global npm packages
- Build artifacts (`bin/`, `rt/built/`, `lib/*.js`)

## Improvement Opportunities

### 1. Workflow Tiers

Consider tiered CI for faster feedback:

| Tier | Trigger | Tests | Target Time |
|------|---------|-------|-------------|
| Fast | All pushes | Core tests only | 5-10 min |
| Full | PRs to master | All tests including multinode | 20-30 min |
| Release | Tags | Full + Docker + security scan | 30-45 min |

### 2. Multinode Testing in CI

Multinode tests require special handling:
- Process orchestration
- Network coordination
- Port management
- Comprehensive cleanup

See [multinode-testing-ci.md](../description-of-existing-functionality/multinode-testing-ci.md) for detailed strategy.

### 3. Matrix Testing

Consider testing across multiple configurations:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest]
    node-version: ['20', '22']
```

### 4. Performance Monitoring

Add build and test performance tracking:
- Track test suite execution time
- Monitor build cache hit rates
- Alert on performance regressions

## Technical Requirements

### System Dependencies
- **GHC**: 9.12.2 (managed by haskell-actions/setup)
- **Node.js**: 22 LTS
- **System packages**: libnuma-dev, diffutils

### CI Environment Considerations
- Network access required for P2P multinode tests
- Multinode tests spawn multiple processes
- Some tests have extended timeouts (up to 60 seconds)

## Security Considerations

- P2P networking components need proper isolation
- Multinode tests require careful cleanup of spawned processes
- Container security for production deployments

## Next Steps

1. Implement tiered CI workflow
2. Add multinode tests to CI (currently not integrated)
3. Set up test result reporting and dashboards
4. Add performance regression detection
5. Consider matrix testing for cross-platform validation
