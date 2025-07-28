# Running libp2p Migration Tests

## Quick Start

### Run all tests:
```bash
make test/libp2p-migration
```

### Run all tests with verbose output:
```bash
make test/libp2p-migration-verbose
```

### Run using the script directly:
```bash
./scripts/run-libp2p-migration-tests.sh
```

## Options

### List all available tests:
```bash
./scripts/run-libp2p-migration-tests.sh -l
```

### Run tests in a specific category:
```bash
# Connection tests only
./scripts/run-libp2p-migration-tests.sh -c p2p-connection-tests

# Stream tests only
./scripts/run-libp2p-migration-tests.sh -c p2p-stream-tests

# Identity tests only
./scripts/run-libp2p-migration-tests.sh -c p2p-identity-tests
```

### Run a specific test:
```bash
# Run just the direct connection test
./scripts/run-libp2p-migration-tests.sh -t direct-connection

# Run just the async stream ops test
./scripts/run-libp2p-migration-tests.sh -t async-stream-ops
```

### Combine options:
```bash
# Run a specific test in verbose mode
./scripts/run-libp2p-migration-tests.sh -v -t connection-retry

# Run all connection tests in verbose mode
./scripts/run-libp2p-migration-tests.sh -v -c p2p-connection-tests
```

## Output

The test runner provides:
- Real-time progress for each test
- Pass/fail status with timing information
- Summary report with total tests, passed, failed
- Detailed results table
- Exit code 0 if all tests pass, 1 if any fail

## Example Output

```
libp2p Migration Test Runner
============================
Test directory: /Users/troupe/tests/rt/libp2p-migration-tests
Tests to run: 4

================================================================
Running Test: p2p-connection-tests/direct-connection
================================================================
✓ PASSED: p2p-connection-tests/direct-connection (5s)

================================================================
Running Test: p2p-connection-tests/connection-retry
================================================================
✓ PASSED: p2p-connection-tests/connection-retry (18s)

================================================================
Test Summary
================================================================
Total tests:  4
Passed:       4
Failed:       0
Total time:   45s

Detailed Results:
-----------------
  p2p-connection-tests/direct-connection             PASS (5s)
  p2p-connection-tests/connection-retry              PASS (18s)
  p2p-identity-tests/peerId-generation               PASS (7s)
  p2p-stream-tests/async-stream-ops                  PASS (15s)

✅ All tests PASSED
```

## Debugging Failed Tests

If a test fails:
1. Check the output shown (last 50 lines for non-verbose mode)
2. Run the specific test in verbose mode: `./scripts/run-libp2p-migration-tests.sh -v -t test-name`
3. Check temporary output files in `/tmp/troupe-multinode-*/output/`
4. Look for P2P debug logs (tests use `--debug-p2p` flag)

## Adding New Tests

1. Create a new directory under the appropriate category
2. Add `config.json`, server `.trp`, and client `.trp` files
3. Follow the patterns in existing tests
4. The test will automatically be discovered and run