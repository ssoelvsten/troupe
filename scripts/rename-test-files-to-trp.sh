#!/bin/bash

# Script to rename all non-.trp test files to .trp extension
# while preserving golden test functionality

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TESTS_DIR="$PROJECT_ROOT/tests"

# Counter for renamed files
count=0

# Function to rename a file
rename_file() {
    local old_path="$1"
    local new_path="$2"
    
    if [ -f "$old_path" ]; then
        echo "Renaming: $old_path -> $new_path"
        mv "$old_path" "$new_path"
        ((count++)) || true
    fi
}

echo "Starting to rename test files from .picox, .pico, .femto, .atto to .trp..."
echo "Working in: $TESTS_DIR"
echo

# Find and rename all test files with non-.trp extensions
# Extensions to convert: .picox, .pico, .femto, .atto
for ext in picox pico femto atto; do
    echo "Processing .$ext files..."
    while IFS= read -r -d '' file; do
        # Get the base name without extension
        dir=$(dirname "$file")
        basename=$(basename "$file" ".$ext")
        new_file="$dir/$basename.trp"
        
        # Check if target .trp file already exists
        if [ -f "$new_file" ]; then
            echo "WARNING: Target file already exists: $new_file"
            echo "         Skipping: $file"
        else
            rename_file "$file" "$new_file"
        fi
    done < <(find "$TESTS_DIR" -name "*.$ext" -type f -print0)
done

echo
echo "Rename complete! Total files renamed: $count"

# Verify golden tests still work
echo
echo "To verify golden tests still work, run:"
echo "  make test"
echo "or"
echo "  bin/golden"