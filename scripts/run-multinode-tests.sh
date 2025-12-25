#!/bin/bash
set -euo pipefail

# Troupe Multi-Node Test Suite Runner

# Source shared environment setup
. "$(dirname "${BASH_SOURCE[0]}")/troupe-env.sh"

MULTINODE_TESTS_DIR="$TROUPE_ROOT/tests/rt/multinode-tests"
VERBOSE=false
PATTERN=""
TEMP_DIR=$(mktemp -d)

# Cleanup on exit
trap "rm -rf $TEMP_DIR" EXIT

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
    
    if "$SCRIPT_DIR/multinode-runner.sh" ${VERBOSE:+-v} "$test_config" 2>&1 | tee "$TEMP_DIR/${test_name}.log"; then
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "  [PASS] Test completed successfully (${duration}s)"
        return 0
    else
        local exit_code=$?
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "  [FAIL] Test failed with exit code $exit_code (${duration}s)"
        echo "  === BEGIN LOG: $test_name ==="
        cat "$TEMP_DIR/${test_name}.log" || echo "  (no log file found)"
        echo "  === END LOG: $test_name ==="
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
    local failed_test_names=()
    for config in "${test_configs[@]}"; do
        total_tests=$((total_tests + 1))
        if ! run_test "$config"; then
            failed_tests=$((failed_tests + 1))
            local test_name
            test_name=$(basename "$(dirname "$config")")
            failed_test_names+=("$test_name")
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
        echo "Failed tests:"
        for test_name in "${failed_test_names[@]}"; do
            echo "  - $test_name (log: $TEMP_DIR/${test_name}.log)"
        done
        echo
        echo "To view logs, run:"
        echo "  cat $TEMP_DIR/<test-name>.log"
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