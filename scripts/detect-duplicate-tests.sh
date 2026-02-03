#!/usr/bin/env bash
# detect-duplicate-tests.sh
# Detects test files with duplicate names across different paths in the test corpus.
# Exit code: 0 if no duplicates found, 1 if duplicates exist
#
# Usage: ./scripts/detect-duplicate-tests.sh [OPTIONS]
#   --quiet        Only output if duplicates found (useful for CI)
#   --show-content Show diff between duplicate files to help with renaming

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TESTS_DIR="$REPO_ROOT/tests"

QUIET=false
SHOW_CONTENT=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --quiet)
            QUIET=true
            shift
            ;;
        --show-content)
            SHOW_CONTENT=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--quiet] [--show-content]"
            exit 2
            ;;
    esac
done

# Create a temp file for processing
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

# Find all golden files and extract base names with their paths
# We look for .golden files (excluding .nocolor.golden to avoid counting twice)
find "$TESTS_DIR" -name "*.golden" -type f | while IFS= read -r golden_file; do
    # Get relative path from tests directory
    rel_path="${golden_file#$TESTS_DIR/}"

    # Extract base name (remove .golden suffix)
    base_name=$(basename "$golden_file" .golden)

    # Skip .nocolor variants (they always accompany the main .golden file)
    if [[ "$base_name" == *.nocolor ]]; then
        continue
    fi

    # Get directory relative to tests/
    dir_path=$(dirname "$rel_path")

    # Output: base_name|dir_path
    echo "$base_name|$dir_path"
done | sort > "$TEMP_FILE"

# Find duplicates by counting occurrences of each base name
DUPLICATES=$(cut -d'|' -f1 "$TEMP_FILE" | sort | uniq -d)

if [[ -z "$DUPLICATES" ]]; then
    if [[ "$QUIET" == false ]]; then
        echo "No duplicate test filenames found."
    fi
    exit 0
fi

# Count duplicates
DUP_COUNT=$(echo "$DUPLICATES" | wc -l | tr -d ' ')

# We have duplicates
echo "========================================"
echo "DUPLICATE TEST FILENAMES DETECTED"
echo "========================================"
echo ""
echo "Found $DUP_COUNT duplicate filename(s) across different paths:"
echo ""

echo "$DUPLICATES" | while IFS= read -r base_name; do
    echo "  $base_name"

    # Collect paths for this duplicate
    paths=()
    while IFS= read -r path; do
        paths+=("$path")
        echo "    - tests/$path/"
    done < <(grep "^${base_name}|" "$TEMP_FILE" | cut -d'|' -f2)

    if [[ "$SHOW_CONTENT" == true ]] && [[ ${#paths[@]} -ge 2 ]]; then
        echo ""
        echo "    Content comparison:"
        echo "    -------------------"

        # Get the source file extension (usually .trp)
        file1="$TESTS_DIR/${paths[0]}/${base_name}.trp"
        file2="$TESTS_DIR/${paths[1]}/${base_name}.trp"

        if [[ -f "$file1" ]] && [[ -f "$file2" ]]; then
            echo ""
            echo "    File 1: tests/${paths[0]}/${base_name}.trp"
            echo "    ~~~~~~~~"
            # Show content with indentation (limit to 20 lines)
            head -20 "$file1" | sed 's/^/    | /'
            if [[ $(wc -l < "$file1") -gt 20 ]]; then
                echo "    | ... (truncated)"
            fi

            echo ""
            echo "    File 2: tests/${paths[1]}/${base_name}.trp"
            echo "    ~~~~~~~~"
            head -20 "$file2" | sed 's/^/    | /'
            if [[ $(wc -l < "$file2") -gt 20 ]]; then
                echo "    | ... (truncated)"
            fi

            echo ""
            echo "    Diff:"
            echo "    ~~~~~"
            # Show unified diff with indentation, limited lines
            diff -u "$file1" "$file2" 2>/dev/null | head -30 | sed 's/^/    /' || true
        else
            echo "    (Source files not found)"
        fi
    fi

    echo ""
done

echo "----------------------------------------"
echo "Total duplicates: $DUP_COUNT"
echo ""
echo "To fix: Rename duplicate files to have unique names."
echo "========================================"

exit 1
