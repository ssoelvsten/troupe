#!/bin/sh

# Source shared environment setup
. "$(dirname "$0")/troupe-common.sh"

# Separate runtime file and program arguments
# First argument is the .js file
# Arguments after -- (including --) are program arguments
js_file="$1"
shift

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
        # Other runtime flags (if any) could be handled here
        program_args="$program_args \"$arg\""
    fi
done

eval "node --stack-trace-limit=1000 $TROUPE_ROOT/rt/built/troupe.mjs -f=$js_file --localonly $program_args"
