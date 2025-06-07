#!/bin/sh
node --stack-trace-limit=1000 $TROUPE/rt/built/troupe.mjs  -f=$1 --localonly # --debug  #--debugmailbox 
a
