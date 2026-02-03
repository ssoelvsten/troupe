#!/bin/sh

# Filter utility for removing timestamps, UUIDs, and peer IDs from test output
# Usage: filter.sh < input > output

# First, filter out lines we don't want in test output
grep -v -E '^\s*\[p2p-config\]|\[libp2p\]|Created key with id:|Using CLI-provided' | \
# Then remove patterns from remaining lines:
# - ISO timestamps like: 2024-01-01T12:00:00.123Z
# - UUID patterns like: 12345678-1234-1234-1234-123456789012
# - Peer IDs like: 12D3KooWAbcDef...
# - RTM timestamps like: 2024-01-01T12:00:00.123[RTM]
# - Quoted strings (remove the quotes)
sed -E \
  -e 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z?(\[RTM\])?//g' \
  -e 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}//g' \
  -e 's/12D3KooW[A-Za-z0-9]{44}//g' \
  -e 's/\[[0-9]{2}:[0-9]{2}:[0-9]{2}\]//g' \
  -e 's/^"(.*)"/\1/' \
  -e 's/"$//'