#!/bin/bash

# Source shared environment setup
_TROUPE_CALLER_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$_TROUPE_CALLER_DIR/scripts/troupe-env.sh"

tmp=`mktemp`.js

$TROUPE_ROOT/bin/troupec $1 --output=$tmp

if [ $? -eq 0 ]; then
    shift
    $TROUPE_ROOT/rt/troupe "$tmp" "$@" 
    code=$?
    rm $tmp
    exit $code
else
    exit $?
fi
