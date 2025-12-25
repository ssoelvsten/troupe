#!/bin/sh

# Source shared environment setup
. "$(dirname "$0")/troupe-env.sh"

node --stack-trace-limit=1000 $TROUPE_ROOT/rt/built/troupe.mjs  -f=$1 --localonly # --debug  #--debugmailbox
