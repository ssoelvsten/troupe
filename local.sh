#!/bin/sh

tmp=`mktemp`.js

# Separate compiler and runtime arguments
compiler_args=""
runtime_args=""

for arg in "$@"; do
    case "$arg" in
        --no-color)
            runtime_args="$runtime_args $arg"
            ;;
        *)
            compiler_args="$compiler_args $arg"
            ;;
    esac
done

$TROUPE/bin/troupec $compiler_args --output=$tmp

if [ $? -eq 0 ]; then
    eval "node --stack-trace-limit=1000 $TROUPE/rt/built/troupe.mjs -f=$tmp --localonly $runtime_args"
    rm $tmp
else 
    exit $?
fi    

