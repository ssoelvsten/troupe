#!/bin/sh
# Shared Troupe environment and utilities
# Source this file to get TROUPE_ROOT and common functions
#
# Usage from scripts in /scripts/:
#   . "$(dirname "$0")/troupe-common.sh"
#
# Usage from root-level scripts:
#   . "$(dirname "$0")/scripts/troupe-common.sh"

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

# Shared argument parsing function
# Sets: TROUPE_COMPILER_ARGS, TROUPE_RUNTIME_ARGS, TROUPE_PROGRAM_ARGS
# Usage: troupe_parse_args "$@"
troupe_parse_args() {
    TROUPE_COMPILER_ARGS=""
    TROUPE_RUNTIME_ARGS=""
    TROUPE_PROGRAM_ARGS=""
    _seen_separator=false

    for arg in "$@"; do
        if [ "$_seen_separator" = true ]; then
            TROUPE_PROGRAM_ARGS="$TROUPE_PROGRAM_ARGS \"$arg\""
        elif [ "$arg" = "--" ]; then
            _seen_separator=true
            TROUPE_PROGRAM_ARGS="--"
        else
            case "$arg" in
                --no-color|--v1-labels|--v1-labels=*|--no-v1-labels)
                    TROUPE_RUNTIME_ARGS="$TROUPE_RUNTIME_ARGS $arg"
                    ;;
                *)
                    TROUPE_COMPILER_ARGS="$TROUPE_COMPILER_ARGS $arg"
                    ;;
            esac
        fi
    done
    unset _seen_separator
}
