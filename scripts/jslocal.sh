#!/bin/sh

# Self-locate: find repo root from script location (script is in scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Use self-location if valid, otherwise fall back to TROUPE env var
if [ -f "$REPO_ROOT/.troupe-root" ]; then
    TROUPE_ROOT="$REPO_ROOT"
elif [ -n "$TROUPE" ]; then
    TROUPE_ROOT="$TROUPE"
else
    echo "Error: Cannot determine Troupe root directory" >&2
    echo "No .troupe-root marker found. Set TROUPE environment variable or run from a Troupe installation." >&2
    exit 1
fi

node --stack-trace-limit=1000 $TROUPE_ROOT/rt/built/troupe.mjs  -f=$1 --localonly # --debug  #--debugmailbox
