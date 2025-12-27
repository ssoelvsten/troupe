#!/bin/bash

# Source shared environment setup
_TROUPE_CALLER_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$_TROUPE_CALLER_DIR/scripts/troupe-env.sh"

tmp=`mktemp`.js

# Separate compiler and program arguments
# Arguments before -- go to compiler
# Arguments after -- (including --) are program arguments passed to runtime
compiler_args=""
program_args=""
seen_separator=false

for arg in "$@"; do
    if [ "$seen_separator" = true ]; then
        # After --, all args are program arguments
        program_args="$program_args \"$arg\""
    elif [ "$arg" = "--" ]; then
        seen_separator=true
        program_args="--"
    else
        compiler_args="$compiler_args $arg"
    fi
done

$TROUPE_ROOT/bin/troupec $compiler_args --output=$tmp

if [ $? -eq 0 ]; then
    eval "$TROUPE_ROOT/rt/troupe \"$tmp\" $program_args"
    code=$?
    rm $tmp
    exit $code
else
    exit $?
fi
