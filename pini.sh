#!/bin/sh

# Self-locate: find repo root from script location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Use self-location if valid, otherwise fall back to TROUPE env var
if [ -f "$SCRIPT_DIR/.troupe-root" ]; then
    TROUPE_ROOT="$SCRIPT_DIR"
elif [ -n "$TROUPE" ]; then
    TROUPE_ROOT="$TROUPE"
else
    echo "Error: Cannot determine Troupe root directory" >&2
    echo "No .troupe-root marker found. Set TROUPE environment variable or run from a Troupe installation." >&2
    exit 1
fi

tmp=`mktemp`

$TROUPE_ROOT/bin/troupec $1 --output=$tmp
if [ $? -eq 0 ]; then
    node --stack-trace-limit=1000 $TROUPE_ROOT/rt/built/troupe.js  -f=$tmp --localonly --pini #  --debug
    rm $tmp
else 
    exit $?
fi    

