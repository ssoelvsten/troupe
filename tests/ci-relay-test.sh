#!/bin/bash
set -euo pipefail

# CI Relay Test - Simple test to verify relay server works
# This test starts the relay and terminates after 10 seconds

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TROUPE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Export TROUPE if not set
export TROUPE="${TROUPE:-$TROUPE_ROOT}"

echo "Running CI Relay Test..."
echo "TROUPE=$TROUPE"

# Create temporary directory for test artifacts
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Check if p2p-tools are built
if [[ ! -f "$TROUPE_ROOT/p2p-tools/built/mkid.mjs" ]]; then
    echo "ERROR: p2p-tools not built. Run 'make p2p-tools' first."
    exit 1
fi

# Build relay if needed
RELAY_DIR="$TROUPE_ROOT/p2p-tools/relay"
RELAY_BUILT="$RELAY_DIR/relay.mjs"

if [[ ! -f "$RELAY_BUILT" ]]; then
    echo "Building relay server..."
    cd "$RELAY_DIR"
    if ! make build/relay; then
        echo "ERROR: Failed to build relay"
        exit 1
    fi
    cd "$TROUPE_ROOT"
fi

# Verify relay executable exists
if [[ ! -f "$RELAY_BUILT" ]]; then
    echo "ERROR: Relay not found at $RELAY_BUILT"
    exit 1
fi

# Generate temporary relay keys
RELAY_KEYS_DIR="$TEMP_DIR/relay-keys"
mkdir -p "$RELAY_KEYS_DIR"

echo "Generating temporary relay keys..."
if ! node "$TROUPE_ROOT/p2p-tools/built/mkid.mjs" \
    --privkeyfile="$RELAY_KEYS_DIR/relay.priv" \
    --idfile="$RELAY_KEYS_DIR/relay.id"; then
    echo "ERROR: Failed to generate relay keys"
    exit 1
fi

# Start relay with timeout
OUTPUT_FILE="$TEMP_DIR/relay.out"
ERROR_FILE="$TEMP_DIR/relay.err"
RELAY_PORT=5559

echo "Starting relay on port $RELAY_PORT (10 second timeout)..."
echo "Executing: timeout 10 node \"$RELAY_BUILT\" --port=$RELAY_PORT --id-file=\"$RELAY_KEYS_DIR/relay.id\" --priv-file=\"$RELAY_KEYS_DIR/relay.priv\""

set +e
DEBUG=libp2p:circuit-relay:server timeout 10 node "$RELAY_BUILT" \
    --port="$RELAY_PORT" \
    --id-file="$RELAY_KEYS_DIR/relay.id" \
    --priv-file="$RELAY_KEYS_DIR/relay.priv" \
    > "$OUTPUT_FILE" 2> "$ERROR_FILE"
exit_code=$?
set -e

if [[ $exit_code -eq 0 ]]; then
    echo "[FAIL] Relay exited normally - should have been killed by timeout"
elif [[ $exit_code -eq 124 ]]; then
    echo "[PASS] Relay timed out after 10 seconds (expected behavior)"
else
    echo "[FAIL] Relay failed with exit code: $exit_code"
fi

# Show output for debugging
echo ""
echo "=== STDOUT ==="
cat "$OUTPUT_FILE" || echo "(no output)"
echo ""
echo "=== STDERR ==="
cat "$ERROR_FILE" || echo "(no errors)"
echo ""

# Check if relay started successfully (output is in stderr for DEBUG mode)
if grep -q "Listening on:" "$ERROR_FILE"; then
    echo "Relay successfully started and was listening"
else
    echo "WARNING: Relay output does not contain 'Listening on:'"
    echo "The relay may have failed to start properly"
fi

# Check for common error patterns
if grep -q "Cannot find module" "$ERROR_FILE"; then
    echo "ERROR: Missing Node.js dependencies"
    exit 1
fi

if grep -q "Error:" "$ERROR_FILE"; then
    echo "ERROR: Relay reported errors during startup"
fi

# For relay test, we expect it to be killed by timeout (exit code 124)
if [[ $exit_code -eq 124 ]]; then
    # Additional check that it was actually listening (check stderr since DEBUG output goes there)
    if grep -q "Listening on:" "$ERROR_FILE"; then
        echo "CI Relay Test: PASSED"
        exit 0
    else
        echo "CI Relay Test: FAILED - Relay did not start listening"
        exit 1
    fi
else
    echo "CI Relay Test: FAILED with exit code $exit_code"
    exit 1
fi