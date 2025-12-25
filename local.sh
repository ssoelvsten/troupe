#!/bin/sh

# Source shared environment setup
_TROUPE_CALLER_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$_TROUPE_CALLER_DIR/scripts/troupe-env.sh"

# Validate TROUPE_ROOT directory exists
if [ ! -d "$TROUPE_ROOT" ]; then
    echo "Error: TROUPE directory does not exist: $TROUPE_ROOT" >&2
    exit 1
fi

# Check for required binaries
if [ ! -x "$TROUPE_ROOT/bin/troupec" ]; then
    echo "Error: Troupe compiler not found or not executable: $TROUPE_ROOT/bin/troupec" >&2
    echo "Please run 'make' in the Troupe directory" >&2
    exit 1
fi

if [ ! -f "$TROUPE_ROOT/rt/built/troupe.mjs" ]; then
    echo "Error: Troupe runtime not found: $TROUPE_ROOT/rt/built/troupe.mjs" >&2
    echo "Please run 'make rt' in the Troupe directory" >&2
    exit 1
fi

# Check for required commands
command -v node >/dev/null 2>&1 || { echo "Error: 'node' command not found. Please install Node.js" >&2; exit 1; }
command -v mktemp >/dev/null 2>&1 || { echo "Error: 'mktemp' command not found" >&2; exit 1; }

tmp=`mktemp`.js

# Separate compiler and runtime arguments
compiler_args=""
runtime_args=""
keep_temp=false

for arg in "$@"; do
    case "$arg" in
        --no-color)
            runtime_args="$runtime_args $arg"
            ;;
        --keep-temp)
            keep_temp=true
            ;;
        *)
            compiler_args="$compiler_args $arg"
            ;;
    esac
done

"$TROUPE_ROOT/bin/troupec" $compiler_args --output="$tmp"

if [ $? -eq 0 ]; then
    eval "node --stack-trace-limit=1000 \"$TROUPE_ROOT/rt/built/troupe.mjs\" -f=\"$tmp\" --localonly $runtime_args"
    exit_code=$?
    if [ "$keep_temp" = false ]; then
        rm "$tmp"
    else
        echo "Temporary file kept at: $tmp"
    fi
    exit $exit_code
else
    exit $?
fi    

