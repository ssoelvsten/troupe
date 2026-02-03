#!/bin/bash
# Setup script for P2P bug reproduction
# Generates keys and aliases needed for the test

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TROUPE_ROOT="${TROUPE:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

echo "Setting up P2P bug reproduction test..."
echo "TROUPE_ROOT: $TROUPE_ROOT"

# Create directories
mkdir -p "$SCRIPT_DIR/keys"
mkdir -p "$SCRIPT_DIR/ids"

# Check if mkid.mjs exists
MKID="$TROUPE_ROOT/p2p-tools/built/mkid.mjs"
if [[ ! -f "$MKID" ]]; then
    echo "Error: mkid.mjs not found at $MKID"
    echo "Please run 'make p2p-tools' from the Troupe root directory"
    exit 1
fi

# Generate relay keys
if [[ ! -f "$SCRIPT_DIR/keys/relay.id" ]]; then
    echo "Generating relay keys..."
    node "$MKID" \
        --idfile="$SCRIPT_DIR/keys/relay.id" \
        --privkeyfile="$SCRIPT_DIR/keys/relay.priv"
    echo "Relay ID: $(cat "$SCRIPT_DIR/keys/relay.id")"
fi

# Generate server identity
if [[ ! -f "$SCRIPT_DIR/ids/server.json" ]]; then
    echo "Generating server identity..."
    node "$MKID" --outfile="$SCRIPT_DIR/ids/server.json"
fi

# Generate client identity
if [[ ! -f "$SCRIPT_DIR/ids/client.json" ]]; then
    echo "Generating client identity..."
    node "$MKID" --outfile="$SCRIPT_DIR/ids/client.json"
fi

# Generate aliases file
MKALIASES="$TROUPE_ROOT/p2p-tools/built/mkaliases.js"
if [[ ! -f "$MKALIASES" ]]; then
    echo "Error: mkaliases.js not found at $MKALIASES"
    echo "Please run 'make p2p-tools' from the Troupe root directory"
    exit 1
fi

echo "Generating aliases..."
node "$MKALIASES" \
    --include "$SCRIPT_DIR/ids/server.json" \
    --include "$SCRIPT_DIR/ids/client.json" \
    --outfile "$SCRIPT_DIR/aliases.json"

echo ""
echo "Setup complete!"
echo "Generated files:"
ls -la "$SCRIPT_DIR/keys/" "$SCRIPT_DIR/ids/" "$SCRIPT_DIR/aliases.json" 2>/dev/null || true
