#!/bin/bash
set -euo pipefail

# CI Network Test - Simple test to verify network.sh works
# This test runs zero.trp with network support and terminates after 4 seconds

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TROUPE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Export TROUPE if not set
export TROUPE="${TROUPE:-$TROUPE_ROOT}"

echo "Running CI Network Test..."
echo "TROUPE=$TROUPE"

# Verify network.sh exists and is executable
if [[ ! -x "$TROUPE_ROOT/network.sh" ]]; then
    echo "ERROR: network.sh not found or not executable at $TROUPE_ROOT/network.sh"
    exit 1
fi

# Verify zero.trp exists
TEST_FILE="$TROUPE_ROOT/tests/rt/pos/core/zero.trp"
if [[ ! -f "$TEST_FILE" ]]; then
    echo "ERROR: Test file not found at $TEST_FILE"
    exit 1
fi

# Verify runtime is built
if [[ ! -f "$TROUPE_ROOT/rt/built/troupe.mjs" ]]; then
    echo "ERROR: Runtime not built. Run 'make rt' first."
    exit 1
fi

# Create temporary directory for test artifacts
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "Starting network.sh with zero.trp (4 second timeout)..."

# Run with timeout
# We expect zero.trp to hang after initialization

OUTPUT_FILE="$TEMP_DIR/output.log"
ERROR_FILE="$TEMP_DIR/error.log"

echo "Executing: timeout 4 \"$TROUPE_ROOT/network.sh\" \"$TEST_FILE\""
set +e
timeout 4 "$TROUPE_ROOT/network.sh" "$TEST_FILE" > "$OUTPUT_FILE" 2> "$ERROR_FILE"
exit_code=$?
set -e

if [[ $exit_code -eq 0 ]]; then
    echo "[FAIL] Network test completed without timeout - unexpected!"
    echo "zero.trp should hang, but it exited normally"
elif [[ $exit_code -eq 124 ]]; then
    echo "[PASS] Network test timed out after 4 seconds (expected behavior)"
else
    echo "[FAIL] Network test failed with exit code: $exit_code"
fi

# Show output for debugging
echo ""
echo "=== STDOUT ==="
cat "$OUTPUT_FILE" || echo "(no output)"
echo ""
echo "=== STDERR ==="
cat "$ERROR_FILE" || echo "(no errors)"
echo ""

# Check for common error patterns
if grep -q "Cannot find module" "$ERROR_FILE"; then
    echo "ERROR: Missing dependencies detected. Check if all modules are built."
    exit 1
fi

if grep -q "ENOENT.*troupe.mjs" "$ERROR_FILE"; then
    echo "ERROR: Runtime not found. Ensure 'make rt' has been run."
    exit 1
fi

if grep -q "Permission denied" "$ERROR_FILE"; then
    echo "ERROR: Permission issues detected."
    exit 1
fi

# For zero.trp, we expect it to hang and timeout (exit code 124)
# This confirms that network initialization succeeded and the program is running
if [[ $exit_code -eq 124 ]]; then
    echo "CI Network Test: PASSED (timed out as expected)"
    exit 0
elif [[ $exit_code -eq 0 ]]; then
    echo "CI Network Test: FAILED - program exited normally instead of hanging"
    exit 1
else
    echo "CI Network Test: FAILED with exit code $exit_code"
    exit 1
fi