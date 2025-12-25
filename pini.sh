#!/bin/sh

# Source shared environment setup
_TROUPE_CALLER_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$_TROUPE_CALLER_DIR/scripts/troupe-env.sh"

tmp=`mktemp`

$TROUPE_ROOT/bin/troupec $1 --output=$tmp
if [ $? -eq 0 ]; then
    node --stack-trace-limit=1000 $TROUPE_ROOT/rt/built/troupe.js  -f=$tmp --localonly --pini #  --debug
    rm $tmp
else 
    exit $?
fi    

