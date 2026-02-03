# Multinode Testing Strategy for CI/CD

> *This document was generated with Claude Code on 2025-12-28.*
> *Last updated: 2025-12-28*

This document outlines the strategy for running Troupe's multinode tests reliably in CI/CD environments.

## Document Status

| Section | Status |
|---------|--------|
| Overview & Architecture | ✅ Accurate |
| Challenge 1: Port Conflicts | ✅ Implemented (dynamic checking) |
| Challenge 2: Process Cleanup | ✅ Implemented |
| Challenge 3: Network Reliability | ✅ Implemented (CI timeout scaling) |
| Challenge 4: Test Isolation | ✅ Implemented |
| Current CI Workflow | ✅ Accurate |
| Phase 2: Parallel Execution | 🔮 Future Work |
| Phase 3: Containerized Testing | 🔮 Future Work |

## Overview

Troupe's multinode tests validate distributed actor communication using P2P networking. These tests are complex, requiring process orchestration, network coordination, and careful resource management.

**Current State**: Tests run in GitHub Actions CI via `run_tests.yml`
**Test Runner**: `./scripts/multinode-runner.sh` orchestrates individual tests
**Test Suite**: `./scripts/run-multinode-tests.sh` runs all multinode tests

## Multinode Test Architecture

### Test Structure

Each multinode test consists of:
- **Configuration** (`config.json`) - Defines nodes, timeouts, network setup
- **Scripts** (`*.trp`) - Troupe source files for each node role
- **Identity System** - P2P keys and aliases generated at runtime
- **Orchestration** - Coordinated startup and message passing

### Current config.json Format

```json
{
  "test_name": "basic-echo",
  "timeout": 60,
  "coordination": "parallel",
  "network": {
    "relay_port": 5555,
    "use_relay": true
  },
  "nodes": [
    {
      "id": "server",
      "script": "echo-server.trp",
      "port": 6789,
      "expected_exit_code": 0
    },
    {
      "id": "client",
      "script": "echo-client.trp",
      "port": 6790,
      "start_delay": 1,
      "expected_exit_code": 0
    }
  ],
  "output": {
    "merge_strategy": "timestamp",
    "filter_patterns": ["uuid", "timestamp", "peer_id"]
  }
}
```

### Infrastructure Components

1. **P2P Relay Server** - Enables NAT traversal using libp2p circuit relay
2. **Node Processes** - Individual Troupe runtime instances
3. **Process Coordination** - Sequential or parallel node startup
4. **Output Management** - Merged and filtered test outputs

## CI/CD Challenges and Solutions

### Challenge 1: Port Conflicts

**Problem**: Multiple tests require unique P2P ports, potential conflicts in parallel execution

**Solution - Dynamic Port Validation** (Implemented in `multinode-runner.sh`):
```bash
check_port_available() {
    local port="$1"
    if command -v lsof >/dev/null 2>&1; then
        if lsof -Pi ":$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
            return 1  # Port is in use
        fi
    fi
    return 0  # Port is available
}

wait_for_port_release() {
    local port="$1"
    local max_wait=10
    local wait_count=0

    while [[ $wait_count -lt $max_wait ]]; do
        if check_port_available "$port"; then
            return 0
        fi
        sleep 1
        ((wait_count++)) || true
    done

    # Force kill processes using the port
    kill_processes_on_port "$port"
    return 0
}

validate_ports() {
    local config_file="$1"
    local ports=($(get_all_ports "$config_file"))

    for port in "${ports[@]}"; do
        if ! check_port_available "$port"; then
            wait_for_port_release "$port"
        fi
    done
}
```

### Challenge 2: Process Cleanup

**Problem**: Background processes (relay servers, nodes) can persist if tests fail

**Solution - Comprehensive Cleanup with CI Scaling** (Implemented):
```bash
# CI environment detection with timeout scaling
TIMEOUT_SCALE=1.0
if [[ -n "${CI:-}" ]] || [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    TIMEOUT_SCALE=1.2  # 20% more time in CI only
fi

cleanup() {
    local exit_code=$?  # Capture immediately

    # Calculate cleanup timeouts with CI scaling
    local relay_grace_period=3
    local node_grace_period=3
    local socket_release_wait=3

    if [[ -n "${TIMEOUT_SCALE:-}" ]]; then
        relay_grace_period=$(awk "BEGIN {print int($relay_grace_period * $TIMEOUT_SCALE + 0.5)}")
        node_grace_period=$(awk "BEGIN {print int($node_grace_period * $TIMEOUT_SCALE + 0.5)}")
        socket_release_wait=$(awk "BEGIN {print int($socket_release_wait * $TIMEOUT_SCALE + 0.5)}")
    fi

    # Graceful shutdown with fallback to force kill
    for pid in "${CLEANUP_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    sleep "$node_grace_period"

    # Force kill remaining
    for pid in "${CLEANUP_PIDS[@]}"; do
        kill -9 "$pid" 2>/dev/null || true
    done

    # Clean up ports
    for port in "${ports[@]}"; do
        kill_processes_on_port "$port"
    done

    # Preserve logs on failure for debugging
    if [[ $exit_code -ne 0 ]]; then
        echo "Test failed. Preserving logs in: $TEMP_DIR" >&2
    fi

    # CRITICAL: Exit with original test exit code
    exit $exit_code
}

trap cleanup EXIT INT TERM
```

### Challenge 3: Network Reliability

**Problem**: P2P networking can be flaky in containerized CI environments

**Solution - CI Timeout Scaling** (Implemented):
- Detect CI environment via `$CI` or `$GITHUB_ACTIONS`
- Apply 1.2x scaling to all timeouts
- Relay startup has 30-second wait with progress logging

**Design Principle - No Automatic Retries**:
> From `multinode-runner.sh` maintenance notes:
> "Network operations should NOT have automatic retries. Retries would interfere with negative tests and tests that verify timeout behavior."

### Challenge 4: Test Isolation

**Problem**: Tests can interfere with each other through shared resources

**Solution - Isolation Strategy** (Implemented):
- **Sequential Execution**: Multinode tests run one at a time
- **Unique Workspaces**: `mktemp -d -t troupe-multinode-XXXXXX` per test
- **Resource Cleanup**: Comprehensive cleanup between tests
- **Port Validation**: Check and clear ports before each test

## Current CI Workflow

The actual GitHub Actions workflow (`run_tests.yml`):

```yaml
name: Build project and run tests
on: [pull_request, push]
jobs:
  build_and_test:
    runs-on: ubuntu-24.04
    env:
      TROUPE: ${{github.workspace}}
    steps:
      - uses: actions/checkout@v4

      # Build steps
      - name: compile the compiler
        run: make compiler
      - name: Install npm dependencies
        run: npm ci && npm install -g typescript
      - name: make p2p-tools
        run: make p2p-tools
      - name: compile the runtime
        run: make rt
      - name: compile lib
        run: make lib
      - name: compile trp-rt
        run: make trp-rt

      # Test steps
      - name: run basic test
        run: ./local.sh tests/rt/pos/core/fib10.trp
      - name: run ci network test
        run: make test/ci-network
      - name: run ci relay test
        run: make test/ci-relay
      - name: run single multinode test with debug
        run: |
          ./scripts/multinode-runner.sh -v tests/rt/multinode-tests/basic-echo/config.json
      - name: run all tests
        run: make test

      # Debug artifact upload on failure
      - name: Upload test logs on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-logs
          path: |
            /tmp/troupe-multinode-*/
          retention-days: 7
```

### CI-Specific Environment Variables

Currently recognized:
```bash
CI=true                    # Generic CI detection
GITHUB_ACTIONS=true        # GitHub Actions specific
TIMEOUT_SCALE=1.2          # Applied automatically in CI
```

## Debugging Failed Tests

### Artifact-Based Debugging

When tests fail in CI, logs are automatically uploaded:
- Path: `/tmp/troupe-multinode-*/`
- Retention: 7 days
- Download from GitHub Actions artifacts

### Local Debugging

```bash
# Verbose mode
./scripts/multinode-runner.sh -v tests/rt/multinode-tests/basic-echo/config.json

# Manual node testing
cd tests/rt/multinode-tests/basic-echo
$TROUPE/network.sh echo-server.trp --id ids/server.json --aliases aliases.json --port 6789
```

### Log Locations

Each test run creates:
- `$TEMP_DIR/output/$node_id.out` - stdout per node
- `$TEMP_DIR/output/$node_id.err` - stderr per node
- `$TEMP_DIR/relay.out` - relay server output

## Success Metrics

### Current Performance
- **Individual test timeout**: Configurable per-test (default 60s, scaled 1.2x in CI)
- **Test reliability**: High with sequential execution
- **Resource cleanup**: Comprehensive with graceful + forced shutdown

### Quality Gates
- All multinode tests pass on every PR
- No resource leaks (processes, ports, files)
- Clear failure diagnostics via artifact upload

---

## Future Work

### Phase 2: Parallel CI with Resource Management

**Status**: 🔮 Not yet implemented

**Approach**: Enable parallel execution with careful resource allocation

```yaml
# Proposed matrix strategy
strategy:
  matrix:
    test-group: [group1, group2, group3]

- name: Run multinode test group
  run: |
    ./scripts/run-multinode-tests.sh -p "group${{ matrix.test-group }}"
  env:
    MULTINODE_PORT_BASE: ${{ 6000 + (strategy.job-index * 100) }}
```

**Requirements**:
- Port pool allocation per job
- Non-overlapping port ranges
- Parallel-safe process tracking

### Phase 3: Containerized Testing

**Status**: 🔮 Not yet implemented

**Approach**: Use Docker containers for complete isolation

```dockerfile
# Proposed multinode test container
FROM troupe-base:latest

# Install network tools
RUN apt-get update && apt-get install -y \
    iproute2 netcat-openbsd

# Copy test infrastructure
COPY scripts/ scripts/
COPY tests/rt/multinode-tests/ tests/rt/multinode-tests/

ENTRYPOINT ["./scripts/run-multinode-tests.sh"]
```

**Benefits**:
- Complete network isolation
- Reproducible environment
- Parallel execution without port conflicts

### Enhanced Test Reporting

**Status**: 🔮 Not yet implemented

```bash
# Proposed GitHub Step Summary integration
generate_ci_report() {
    cat >> "$GITHUB_STEP_SUMMARY" << EOF
## Multinode Test Results
- **Total Tests**: $total_tests
- **Passed**: $passed_tests
- **Failed**: $failed_tests
- **Success Rate**: $(( passed_tests * 100 / total_tests ))%
EOF
}
```

### Enhanced config.json Format

**Status**: 🔮 Proposed for future implementation

```json
{
  "test_name": "enhanced-test",
  "timeout": 60,
  "coordination": "parallel",
  "ci_settings": {
    "cleanup_timeout": 30,
    "resource_limits": {
      "max_memory_mb": 512,
      "max_processes": 10
    }
  },
  "network": {
    "relay_port": "auto",
    "port_range": "auto",
    "connection_timeout": 15
  },
  "nodes": [...]
}
```

## Risk Assessment

### Low Risk (Implemented)
- Sequential test execution ✅
- Enhanced cleanup scripts ✅
- Timeout improvements ✅
- CI environment detection ✅

### Medium Risk (Future)
- Parallel test execution
- Dynamic port allocation pools
- Network reliability improvements

### High Risk (Future)
- Container-based isolation
- Cross-platform multinode testing
- Advanced resource management
