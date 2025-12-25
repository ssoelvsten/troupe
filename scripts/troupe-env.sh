#!/bin/sh
# Shared Troupe environment setup
# Source this file to get TROUPE_ROOT set correctly
#
# Usage from scripts in /scripts/:
#   . "$(dirname "$0")/troupe-env.sh"
#
# Usage from root-level scripts:
#   . "$(dirname "$0")/scripts/troupe-env.sh"

# Determine the repo root from this file's location
# Use BASH_SOURCE if available (bash), otherwise fall back to the approach
# where the caller sets _TROUPE_CALLER_DIR before sourcing
if [ -n "${BASH_SOURCE:-}" ]; then
    _TROUPE_ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [ -n "${_TROUPE_CALLER_DIR:-}" ]; then
    # Caller is a root-level script that set _TROUPE_CALLER_DIR
    _TROUPE_ENV_DIR="$_TROUPE_CALLER_DIR/scripts"
else
    # Caller is in scripts/ directory - use $0 (works for non-sourced execution)
    _TROUPE_ENV_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
_TROUPE_REPO_ROOT="$(cd "$_TROUPE_ENV_DIR/.." && pwd)"

# Use self-location if valid, otherwise fall back to TROUPE env var
if [ -f "$_TROUPE_REPO_ROOT/.troupe-root" ]; then
    TROUPE_ROOT="$_TROUPE_REPO_ROOT"
elif [ -n "$TROUPE" ]; then
    TROUPE_ROOT="$TROUPE"
else
    echo "Error: Cannot determine Troupe root directory" >&2
    echo "No .troupe-root marker found. Set TROUPE environment variable or run from a Troupe installation." >&2
    exit 1
fi

export TROUPE_ROOT

# Clean up internal variables
unset _TROUPE_ENV_DIR _TROUPE_REPO_ROOT
