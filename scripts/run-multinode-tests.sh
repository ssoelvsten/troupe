#!/bin/bash
set -euo pipefail

# Troupe Multi-Node Test Suite Runner

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TROUPE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MULTINODE_TESTS_DIR="$TROUPE_ROOT/tests/rt/multinode-tests"
VERBOSE=false
PATTERN=""

usage() {
    cat << EOF
Usage: $0 [options]

Options:
    -v, --verbose       Enable verbose output
    -p, --pattern       Run only tests matching pattern
    -h, --help         Show this help message

Examples:
    $0                  # Run all multi-node tests
    $0 -v               # Run all tests with verbose output
    $0 -p echo          # Run only tests containing 'echo'
EOF
}

log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[$(date '+%H:%M:%S')] $*" >&2
    fi
}

run_test() {
    local test_config="$1"
    local test_name
    test_name=$(basename "$(dirname "$test_config")")
    
    echo "Running test: $test_name"
    
    if [[ -n "$PATTERN" && "$test_name" != *"$PATTERN"* ]]; then
        echo "  Skipped (pattern mismatch)"
        return 0
    fi
    
    local start_time
    start_time=$(date +%s)
    
    if "$SCRIPT_DIR/multinode-runner.sh" ${VERBOSE:+-v} "$test_config"; then
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "  ✓ PASSED (${duration}s)"
        return 0
    else
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "  ✗ FAILED (${duration}s)"
        return 1
    fi
}

main() {
    local failed_tests=0
    local total_tests=0
    local start_time
    start_time=$(date +%s)
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -p|--pattern)
                PATTERN="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            -*)
                echo "Unknown option: $1" >&2
                usage
                exit 1
                ;;
            *)
                echo "Unexpected argument: $1" >&2
                usage
                exit 1
                ;;
        esac
    done
    
    echo "Troupe Multi-Node Test Suite"
    echo "============================"
    
    if [[ ! -d "$MULTINODE_TESTS_DIR" ]]; then
        echo "Error: Multi-node tests directory not found: $MULTINODE_TESTS_DIR" >&2
        exit 1
    fi
    
    # Find all test configurations
    local test_configs=()
    while IFS= read -r -d '' config; do
        test_configs+=("$config")
    done < <(find "$MULTINODE_TESTS_DIR" -name "config.json" -print0 | sort -z)
    
    if [[ ${#test_configs[@]} -eq 0 ]]; then
        echo "No multi-node tests found in $MULTINODE_TESTS_DIR"
        exit 0
    fi
    
    echo "Found ${#test_configs[@]} test(s)"
    if [[ -n "$PATTERN" ]]; then
        echo "Pattern filter: $PATTERN"
    fi
    echo
    
    # Run each test
    for config in "${test_configs[@]}"; do
        total_tests=$((total_tests + 1))
        if ! run_test "$config"; then
            failed_tests=$((failed_tests + 1))
        fi
        echo
    done
    
    # Summary
    local end_time
    end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    local passed_tests=$((total_tests - failed_tests))
    
    echo "Test Summary"
    echo "============"
    echo "Total tests:  $total_tests"
    echo "Passed:       $passed_tests"
    echo "Failed:       $failed_tests"
    echo "Duration:     ${total_duration}s"
    
    if [[ $failed_tests -gt 0 ]]; then
        echo
        echo "Some tests failed!"
        exit 1
    else
        echo
        echo "All tests passed!"
        exit 0
    fi
}

main "$@"