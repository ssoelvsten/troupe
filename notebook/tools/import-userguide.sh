#!/bin/bash
# Copies user guide .tpnb files from examples/userguide-tpnb/ into the
# notebook storage directory so they are available in the notebook UI.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/examples/userguide-tpnb"
TARGET_DIR="${1:-.notebook-storage}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

count=0
for f in "$SOURCE_DIR"/*.tpnb; do
  [ -f "$f" ] || continue
  cp "$f" "$TARGET_DIR/"
  echo "Copied $(basename "$f")"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "No .tpnb files found in $SOURCE_DIR"
else
  echo "Imported $count notebook(s) into $TARGET_DIR/"
fi
