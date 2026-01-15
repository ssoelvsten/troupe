#!/bin/bash
# Run script for P2P bug reproduction
# This script demonstrates the peer discovery bug

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TROUPE_ROOT="${TROUPE:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# Configuration
RELAY_PORT=15555
SERVER_PORT=16789
CLIENT_PORT=16790

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up..."
    # Kill all background jobs
    jobs -p | xargs -r kill 2>/dev/null || true
    # Kill any processes on our ports
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti :$RELAY_PORT | xargs kill -9 2>/dev/null || true
        lsof -ti :$SERVER_PORT | xargs kill -9 2>/dev/null || true
        lsof -ti :$CLIENT_PORT | xargs kill -9 2>/dev/null || true
    fi
    # Kill relay and network.sh processes
    pkill -f "relay.mjs.*$RELAY_PORT" 2>/dev/null || true
    pkill -f "network.sh.*p2pbug" 2>/dev/null || true
    echo "Cleanup complete"
}

trap cleanup EXIT INT TERM

echo "=========================================="
echo "P2P Peer Discovery Bug Reproduction"
echo "=========================================="
echo ""

# Always regenerate identities to ensure fresh test (no cached peer info)
echo "Running setup (regenerating identities for clean test)..."
rm -rf "$SCRIPT_DIR/keys" "$SCRIPT_DIR/ids" "$SCRIPT_DIR/aliases.json" 2>/dev/null || true
bash "$SCRIPT_DIR/setup.sh"
echo ""

# Check relay exists
RELAY_MJS="$TROUPE_ROOT/p2p-tools/relay/relay.mjs"
if [[ ! -f "$RELAY_MJS" ]]; then
    echo "Error: relay.mjs not found. Please run 'make' in p2p-tools/relay/"
    exit 1
fi

# Get relay ID for multiaddr
RELAY_ID=$(cat "$SCRIPT_DIR/keys/relay.id")
RELAY_MULTIADDR="/ip4/127.0.0.1/tcp/$RELAY_PORT/ws/p2p/$RELAY_ID"

echo "Step 1: Starting relay on port $RELAY_PORT..."
DEBUG=libp2p:circuit-relay:server node "$RELAY_MJS" \
    --port=$RELAY_PORT \
    --id-file="$SCRIPT_DIR/keys/relay.id" \
    --priv-file="$SCRIPT_DIR/keys/relay.priv" \
    > "$SCRIPT_DIR/relay.log" 2>&1 &
RELAY_PID=$!

# Wait for relay to start
sleep 2
if ! kill -0 $RELAY_PID 2>/dev/null; then
    echo "Error: Relay failed to start. Check relay.log"
    cat "$SCRIPT_DIR/relay.log"
    exit 1
fi
echo "Relay started (PID: $RELAY_PID)"
echo "Relay multiaddr: $RELAY_MULTIADDR"
echo ""

echo "Step 2: Starting server (with --relay-only to disable DHT/mDNS)..."
cd "$TROUPE_ROOT"
./network.sh "$SCRIPT_DIR/server.trp" \
    --id "$SCRIPT_DIR/ids/server.json" \
    --aliases "$SCRIPT_DIR/aliases.json" \
    --port $SERVER_PORT \
    --relay "$RELAY_MULTIADDR" \
    --relay-only \
    --debugp2p \
    > "$SCRIPT_DIR/server.log" 2>&1 &
SERVER_PID=$!

# Wait for server to register
sleep 3
echo "Server started (PID: $SERVER_PID)"
echo ""

echo "Step 3: Starting client (with --relay-only to disable DHT/mDNS)..."
echo "The client will try to find the server via whereis()."
echo "This is where the bug manifests - the client cannot discover the server."
echo ""
./network.sh "$SCRIPT_DIR/client.trp" \
    --id "$SCRIPT_DIR/ids/client.json" \
    --aliases "$SCRIPT_DIR/aliases.json" \
    --port $CLIENT_PORT \
    --relay "$RELAY_MULTIADDR" \
    --relay-only \
    --debugp2p \
    > "$SCRIPT_DIR/client.log" 2>&1 &
CLIENT_PID=$!

echo "Client started (PID: $CLIENT_PID)"
echo ""
echo "Waiting for test to complete (client timeout: ~10 seconds)..."
echo "Watch the logs in real-time with: tail -f $SCRIPT_DIR/*.log"
echo ""

# Wait for client to finish (disable pipefail temporarily)
set +e
wait $CLIENT_PID 2>/dev/null
CLIENT_EXIT=$?

# Give server a moment then get its status
sleep 1
SERVER_EXIT=0
if kill -0 $SERVER_PID 2>/dev/null; then
    # Server still running, kill it
    kill $SERVER_PID 2>/dev/null || true
    SERVER_EXIT=1
else
    wait $SERVER_PID 2>/dev/null || SERVER_EXIT=$?
fi
set -e

echo ""
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo ""

echo "--- Server Output ---"
cat "$SCRIPT_DIR/server.log" 2>/dev/null || echo "(no output)"
echo ""

echo "--- Client Output ---"
cat "$SCRIPT_DIR/client.log" 2>/dev/null || echo "(no output)"
echo ""

echo "--- Exit Codes ---"
echo "Client exit code: $CLIENT_EXIT"
echo "Server exit code: $SERVER_EXIT"
echo ""

if [[ $CLIENT_EXIT -eq 124 ]]; then
    echo "=========================================="
    echo "BUG REPRODUCED (timeout)!"
    echo "=========================================="
    echo ""
    echo "The client timed out trying to find the server."
    echo "This confirms the peer discovery bug."
    echo ""
    echo "Root cause: The relay is a pure circuit relay that doesn't"
    echo "share peer information. The DHT uses global bootstrap nodes"
    echo "that don't know about local ephemeral test peers."
    exit 0
elif [[ $CLIENT_EXIT -eq 7 ]] || grep -q "NO_RESERVATION" "$SCRIPT_DIR/client.log" 2>/dev/null; then
    echo "=========================================="
    echo "BUG REPRODUCED (NO_RESERVATION)!"
    echo "=========================================="
    echo ""
    echo "The client failed with NO_RESERVATION error."
    echo "This confirms the relay connectivity bug."
    echo ""
    echo "Root cause: In circuit relay v2, peers must make a reservation"
    echo "with the relay before others can connect through it. The current"
    echo "implementation doesn't set up relay listening/reservations."
    exit 0
elif [[ $CLIENT_EXIT -eq 0 ]]; then
    echo "=========================================="
    echo "TEST PASSED (Bug not reproduced)"
    echo "=========================================="
    echo ""
    echo "The client successfully found the server."
    echo "This might happen if mDNS discovery worked, or if"
    echo "the peers were already known from a previous run."
    exit 0
else
    echo "=========================================="
    echo "UNEXPECTED RESULT"
    echo "=========================================="
    echo ""
    echo "Check the logs for errors:"
    echo "  - $SCRIPT_DIR/relay.log"
    echo "  - $SCRIPT_DIR/server.log"
    echo "  - $SCRIPT_DIR/client.log"
    exit 1
fi
