#!/bin/bash

# Source shared environment setup
_TROUPE_CALLER_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$_TROUPE_CALLER_DIR/scripts/troupe-common.sh"

# Validate that required build artifacts exist
if [ ! -x "$TROUPE_ROOT/bin/troupec" ]; then
    echo "Error: Compiler not found. Run 'make compiler' first." >&2
    exit 1
fi
if [ ! -f "$TROUPE_ROOT/rt/built/troupe.mjs" ]; then
    echo "Error: Runtime not found. Run 'make rt' first." >&2
    exit 1
fi

tmp=$(mktemp).js

# Parse arguments (sets TROUPE_COMPILER_ARGS, TROUPE_RUNTIME_ARGS, TROUPE_PROGRAM_ARGS)
troupe_parse_args "$@"

"$TROUPE_ROOT/bin/troupec" $TROUPE_COMPILER_ARGS --output="$tmp"

if [ $? -eq 0 ]; then
    eval "$TROUPE_ROOT/rt/troupe \"$tmp\" $TROUPE_RUNTIME_ARGS $TROUPE_PROGRAM_ARGS"
    code=$?
    rm "$tmp"
    exit $code
else
    exit $?
fi
