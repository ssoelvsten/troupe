#!/bin/sh

# Check if TROUPE environment variable is set
if [ -z "$TROUPE" ]; then
    echo "Error: TROUPE environment variable is not set" >&2
    echo "Please set TROUPE to the Troupe repository root directory" >&2
    exit 1
fi

# Validate TROUPE directory exists
if [ ! -d "$TROUPE" ]; then
    echo "Error: TROUPE directory does not exist: $TROUPE" >&2
    exit 1
fi

# Check for required binaries
if [ ! -x "$TROUPE/bin/troupec" ]; then
    echo "Error: Troupe compiler not found or not executable: $TROUPE/bin/troupec" >&2
    echo "Please run 'make' in the Troupe directory" >&2
    exit 1
fi

if [ ! -f "$TROUPE/rt/built/troupe.mjs" ]; then
    echo "Error: Troupe runtime not found: $TROUPE/rt/built/troupe.mjs" >&2
    echo "Please run 'make rt' in the Troupe directory" >&2
    exit 1
fi

# Check for required commands
command -v node >/dev/null 2>&1 || { echo "Error: 'node' command not found. Please install Node.js" >&2; exit 1; }
command -v mktemp >/dev/null 2>&1 || { echo "Error: 'mktemp' command not found" >&2; exit 1; }

tmp=`mktemp`.js

# Separate compiler and runtime arguments
input_file=""
keep_temp=false
compiler_args=""
runtime_args=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        # Non runtime/compiler arguments
        --keep-temp)
            keep_temp=true
            shift;
            ;;
        # Shared arguments
        -i)
            runtime_args="$runtime_args $1 $2"
            compiler_args="$compiler_args $1 $2"
            shift;
            shift;
            ;;
        --include=*)
            runtime_args="$runtime_args $1"
            compiler_args="$compiler_args $1"
            shift;
            ;;
        # Runtime arguments
        --no-color)
            runtime_args="$runtime_args $1"
            shift;
            ;;
        # Compiler arguments
        -o)         # ignore -o <..>
            shift;
            shift;
            ;;
        --output=*) # --output=<..>
            shift;
            ;;
        -*|--*)
            compiler_args="$compiler_args $1"
            shift;
            ;;
        *)
            input_file="$1"
            shift;
            ;;
    esac
done

"$TROUPE/bin/troupec" $input_file $compiler_args --output="$tmp"

if [ $? -eq 0 ]; then
    eval "node --stack-trace-limit=1000 \"$TROUPE/rt/built/troupe.mjs\" -f=\"$tmp\" --localonly $runtime_args"
    if [ "$keep_temp" = false ]; then
        rm "$tmp"
    else
        echo "Temporary file kept at: $tmp"
    fi
else 
    exit $?
fi    

