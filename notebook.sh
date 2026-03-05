#!/bin/sh
# Launch the Troupe Notebook server

_TROUPE_CALLER_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$_TROUPE_CALLER_DIR/scripts/troupe-env.sh"

# Verify Troupe installation
if [ ! -x "$TROUPE_ROOT/bin/troupec" ]; then
    echo "Error: Troupe compiler not found. Run 'make compiler'" >&2
    exit 1
fi

if [ ! -f "$TROUPE_ROOT/rt/built/troupe.mjs" ]; then
    echo "Error: Troupe runtime not built. Run 'make rt'" >&2
    exit 1
fi

if [ ! -f "$TROUPE_ROOT/notebook/built/server.mjs" ]; then
    echo "Error: Notebook server not built. Run 'make notebook'" >&2
    exit 1
fi

export TROUPE_ROOT
exec node "$TROUPE_ROOT/notebook/built/server.mjs" "$@"
