#!/bin/bash
set -euo pipefail

# Troupe libp2p Migration Test Runner
# Runs all libp2p migration tests and provides a summary report

# Source shared environment setup
. "$(dirname "${BASH_SOURCE[0]}")/troupe-env.sh"

TEST_BASE_DIR="$TROUPE_ROOT/tests/rt/libp2p-migration-tests"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0
TEST_RESULTS=()

# Timing
START_TIME=$(date +%s)

usage() {
    cat << EOF
Usage: $0 [options]

Run all libp2p migration tests and provide a summary report.

Options:
    -v, --verbose      Enable verbose output
    -c, --category     Run only tests in specified category
    -t, --test         Run only specified test
    -l, --list         List all available tests without running
    -h, --help         Show this help message

Categories:
    p2p-connection-tests    Connection lifecycle tests
    p2p-stream-tests       Stream operation tests  
    p2p-identity-tests     PeerId and crypto tests
    p2p-error-tests        Error handling tests
    p2p-performance-tests  Performance benchmarks
    p2p-migration-tests    Version compatibility tests

Examples:
    $0                                    # Run all tests
    $0 -v                                 # Run all tests with verbose output
    $0 -c p2p-connection-tests           # Run only connection tests
    $0 -t direct-connection              # Run specific test
    $0 -l                                # List all available tests

EOF
}

# Parse arguments
VERBOSE=false
CATEGORY=""
SPECIFIC_TEST=""
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -c|--category)
            CATEGORY="$2"
            shift 2
            ;;
        -t|--test)
            SPECIFIC_TEST="$2"
            shift 2
            ;;
        -l|--list)
            LIST_ONLY=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Function to print colored output
print_color() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to print test header
print_test_header() {
    local test_name=$1
    echo ""
    echo "================================================================"
    print_color "$BLUE" "Running Test: $test_name"
    echo "================================================================"
}

# Function to format time
format_time() {
    local seconds=$1
    local mins=$((seconds / 60))
    local secs=$((seconds % 60))
    if [[ $mins -gt 0 ]]; then
        echo "${mins}m ${secs}s"
    else
        echo "${secs}s"
    fi
}

# Function to get test name from path
get_test_name() {
    local config_path=$1
    local category=$(basename $(dirname $(dirname "$config_path")))
    local test=$(basename $(dirname "$config_path"))
    echo "$category/$test"
}

# Function to run a single test
run_test() {
    local config_file=$1
    local test_name=$(get_test_name "$config_file")
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    print_test_header "$test_name"
    
    local test_start=$(date +%s)
    local test_output=""
    local exit_code=0
    
    # Run the test
    if [[ "$VERBOSE" == "true" ]]; then
        # Verbose mode - show output in real time
        "$SCRIPT_DIR/multinode-runner.sh" -v "$config_file" || exit_code=$?
    else
        # Normal mode - capture output
        test_output=$("$SCRIPT_DIR/multinode-runner.sh" "$config_file" 2>&1) || exit_code=$?
    fi
    
    local test_end=$(date +%s)
    local test_duration=$((test_end - test_start))
    
    # Check result
    if [[ $exit_code -eq 0 ]]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        print_color "$GREEN" "✓ PASSED: $test_name ($(format_time $test_duration))"
        TEST_RESULTS+=("PASS|$test_name|$test_duration")
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        print_color "$RED" "✗ FAILED: $test_name ($(format_time $test_duration)) - Exit code: $exit_code"
        TEST_RESULTS+=("FAIL|$test_name|$test_duration|$exit_code")
        
        # Show output for failed tests even in non-verbose mode
        if [[ "$VERBOSE" != "true" ]] && [[ -n "$test_output" ]]; then
            echo ""
            echo "Test output:"
            echo "------------"
            echo "$test_output" | tail -50
            echo "------------"
            echo "(Showing last 50 lines of output)"
        fi
    fi
}

# Function to list all tests
list_tests() {
    print_color "$BLUE" "Available libp2p Migration Tests:"
    echo ""
    
    local current_category=""
    while IFS= read -r config_file; do
        local test_name=$(get_test_name "$config_file")
        local category=$(echo "$test_name" | cut -d'/' -f1)
        local test=$(echo "$test_name" | cut -d'/' -f2)
        
        if [[ "$category" != "$current_category" ]]; then
            echo ""
            print_color "$YELLOW" "$category:"
            current_category="$category"
        fi
        
        echo "  - $test"
    done < <(find "$TEST_BASE_DIR" -name "config.json" -type f | grep -E "p2p-.*-tests" | sort)
}

# Function to find test configs
find_test_configs() {
    local search_path="$TEST_BASE_DIR"
    
    if [[ -n "$CATEGORY" ]]; then
        search_path="$TEST_BASE_DIR/$CATEGORY"
        if [[ ! -d "$search_path" ]]; then
            print_color "$RED" "Error: Category '$CATEGORY' not found"
            exit 1
        fi
    fi
    
    if [[ -n "$SPECIFIC_TEST" ]]; then
        # Search for specific test across all categories or within category
        if [[ -n "$CATEGORY" ]]; then
            find "$search_path" -name "config.json" -type f | grep "/$SPECIFIC_TEST/"
        else
            find "$search_path" -name "config.json" -type f | grep "/$SPECIFIC_TEST/"
        fi
    else
        # Find all test configs
        find "$search_path" -name "config.json" -type f | grep -E "p2p-.*-tests" | sort
    fi
}

# Main execution
main() {
    # Check if test directory exists
    if [[ ! -d "$TEST_BASE_DIR" ]]; then
        print_color "$RED" "Error: libp2p migration tests directory not found at $TEST_BASE_DIR"
        exit 1
    fi
    
    # Check if multinode-runner.sh exists
    if [[ ! -x "$SCRIPT_DIR/multinode-runner.sh" ]]; then
        print_color "$RED" "Error: multinode-runner.sh not found or not executable"
        exit 1
    fi
    
    # List mode
    if [[ "$LIST_ONLY" == "true" ]]; then
        list_tests
        exit 0
    fi
    
    # Find test configs
    TEST_CONFIGS=()
    while IFS= read -r config; do
        TEST_CONFIGS+=("$config")
    done < <(find_test_configs)
    
    if [[ ${#TEST_CONFIGS[@]} -eq 0 ]]; then
        print_color "$RED" "No tests found matching criteria"
        exit 1
    fi
    
    # Print test plan
    print_color "$BLUE" "libp2p Migration Test Runner"
    echo "============================"
    echo "Test directory: $TEST_BASE_DIR"
    echo "Tests to run: ${#TEST_CONFIGS[@]}"
    if [[ -n "$CATEGORY" ]]; then
        echo "Category filter: $CATEGORY"
    fi
    if [[ -n "$SPECIFIC_TEST" ]]; then
        echo "Test filter: $SPECIFIC_TEST"
    fi
    echo ""
    
    # Run tests
    for config in "${TEST_CONFIGS[@]}"; do
        run_test "$config"
    done
    
    # Calculate total time
    END_TIME=$(date +%s)
    TOTAL_TIME=$((END_TIME - START_TIME))
    
    # Print summary
    echo ""
    echo "================================================================"
    print_color "$BLUE" "Test Summary"
    echo "================================================================"
    echo "Total tests:  $TOTAL_TESTS"
    print_color "$GREEN" "Passed:       $PASSED_TESTS"
    if [[ $FAILED_TESTS -gt 0 ]]; then
        print_color "$RED" "Failed:       $FAILED_TESTS"
    else
        echo "Failed:       $FAILED_TESTS"
    fi
    if [[ $SKIPPED_TESTS -gt 0 ]]; then
        print_color "$YELLOW" "Skipped:      $SKIPPED_TESTS"
    fi
    echo "Total time:   $(format_time $TOTAL_TIME)"
    echo ""
    
    # Detailed results
    if [[ ${#TEST_RESULTS[@]} -gt 0 ]]; then
        echo "Detailed Results:"
        echo "-----------------"
        for result in "${TEST_RESULTS[@]}"; do
            IFS='|' read -r status test_name duration exit_code <<< "$result"
            if [[ "$status" == "PASS" ]]; then
                printf "  %-50s %s %s\n" "$test_name" "$(print_color "$GREEN" "PASS")" "($(format_time $duration))"
            else
                printf "  %-50s %s %s Exit: %s\n" "$test_name" "$(print_color "$RED" "FAIL")" "($(format_time $duration))" "$exit_code"
            fi
        done
        echo ""
    fi
    
    # Exit with appropriate code
    if [[ $FAILED_TESTS -gt 0 ]]; then
        print_color "$RED" "❌ Test suite FAILED"
        exit 1
    else
        print_color "$GREEN" "✅ All tests PASSED"
        exit 0
    fi
}

# Run main function
main