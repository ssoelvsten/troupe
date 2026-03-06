#!/bin/bash
#
# Shell-based tests for --result-socket using socat.
# These tests verify both CLI behavior and socket data content,
# providing complementary coverage to test-result-socket.mjs (Node.js).
#
# Prerequisite: socat must be installed.
# - Linux: apt install socat
# - macOS: brew install socat
#

set -e

# Source troupe-env.sh to get TROUPE_ROOT (handles worktrees and .troupe-root marker)
. "$(cd "$(dirname "$0")/../../.." && pwd)/scripts/troupe-env.sh"
TROUPEC="$TROUPE_ROOT/bin/troupec"
RUNTIME="$TROUPE_ROOT/rt/built/troupe.mjs"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"

PASSED=0
FAILED=0
TMPDIR_ROOT=""

pass() {
    PASSED=$((PASSED + 1))
    echo "  PASS: $1"
}

fail() {
    FAILED=$((FAILED + 1))
    echo "  FAIL: $1"
    if [ -n "${2:-}" ]; then
        echo "        $2"
    fi
}

# Create a fresh temp directory for each test
make_tmpdir() {
    TMPDIR_ROOT=$(mktemp -d /tmp/troupe-socat-test-XXXXXXXX)
}

cleanup_tmpdir() {
    rm -rf "$TMPDIR_ROOT"
}

compile() {
    local trp="$1"
    local out="$TMPDIR_ROOT/program.js"
    "$TROUPEC" "$trp" --output="$out" 2>/dev/null
    echo "$out"
}

# Helper: start a socat listener that captures socket data to a file.
# Usage: start_socat_listener
# Uses $TMPDIR_ROOT/test.sock and $TMPDIR_ROOT/sock-data.out
start_socat_listener() {
    local sock="$TMPDIR_ROOT/test.sock"
    local outfile="$TMPDIR_ROOT/sock-data.out"
    # -u: unidirectional mode (read from socket, write to file only)
    # This avoids socat trying to read from the file back to the socket,
    # which caused "read-write mode but only supports write-only" errors.
    socat -u UNIX-LISTEN:"$sock",fork OPEN:"$outfile",creat,append 2>/dev/null &
    SOCAT_PID=$!
    sleep 0.3
}

stop_socat_listener() {
    kill "$SOCAT_PID" 2>/dev/null || true
    wait "$SOCAT_PID" 2>/dev/null || true
}

run_with_socket() {
    local js="$1"
    shift
    node --stack-trace-limit=1000 "$RUNTIME" -f="$js" --localonly \
        --suppress-local-info-message --result-socket="$TMPDIR_ROOT/test.sock" \
        "$@" 2>/dev/null || true
    sleep 0.3
}

run_without_socket() {
    local js="$1"
    shift
    node --stack-trace-limit=1000 "$RUNTIME" -f="$js" --localonly \
        --suppress-local-info-message \
        "$@" 2>/dev/null || true
}

sock_data() {
    cat "$TMPDIR_ROOT/sock-data.out" 2>/dev/null
}

echo "Result Socket Tests (socat)"
echo "==========================="

# Test 1: Regression -- stdout shows message without socket
test_regression_stdout() {
    local name="Regression: stdout shows 'Main thread finished' without --result-socket"
    make_tmpdir
    local js
    js=$(compile "$TEST_DIR/simple.trp")

    run_without_socket "$js" > "$TMPDIR_ROOT/stdout.out"

    if grep -q "Main thread finished" "$TMPDIR_ROOT/stdout.out" && grep -q "42" "$TMPDIR_ROOT/stdout.out"; then
        pass "$name"
    else
        fail "$name" "expected 'Main thread finished' with value 42 on stdout"
        cat "$TMPDIR_ROOT/stdout.out"
    fi
    cleanup_tmpdir
}

# Test 2: Stdout is suppressed when --result-socket is used
test_stdout_suppressed() {
    local name="Stdout suppressed: 'Main thread finished' not printed when socket is used"
    make_tmpdir
    local js
    js=$(compile "$TEST_DIR/simple.trp")

    start_socat_listener
    run_with_socket "$js" > "$TMPDIR_ROOT/stdout.out"
    stop_socat_listener

    if grep -q "Main thread finished" "$TMPDIR_ROOT/stdout.out"; then
        fail "$name" "stdout should NOT contain 'Main thread finished' when socket is used"
        cat "$TMPDIR_ROOT/stdout.out"
    else
        pass "$name"
    fi
    cleanup_tmpdir
}

# Test 3: Graceful degradation when socket path doesn't exist
test_no_listener() {
    local name="Graceful degradation: runtime runs normally if socket is unavailable"
    make_tmpdir
    local js
    js=$(compile "$TEST_DIR/simple.trp")

    node --stack-trace-limit=1000 "$RUNTIME" -f="$js" --localonly \
        --suppress-local-info-message --result-socket=/tmp/nonexistent-sock-XXXXXXXX.sock \
        2>/dev/null
    local exit_code=$?

    if [ "$exit_code" -eq 0 ]; then
        pass "$name"
    else
        fail "$name" "expected exit code 0, got $exit_code"
    fi
    cleanup_tmpdir
}

# Test 4: Receives main-thread-result with correct value
test_main_thread_result() {
    local name="Data: receives main-thread-result with value containing 42"
    make_tmpdir
    local js
    js=$(compile "$TEST_DIR/simple.trp")

    start_socat_listener
    run_with_socket "$js"
    stop_socat_listener

    if sock_data | grep -q '"type":"main-thread-result"' && sock_data | grep -q '"value":"42'; then
        pass "$name"
    else
        fail "$name" "expected main-thread-result with value 42 in socket data"
        echo "        socket data: $(sock_data)"
    fi
    cleanup_tmpdir
}

# Test 5: Receives process-exit message
test_process_exit() {
    local name="Data: receives process-exit with exitCode 0"
    make_tmpdir
    local js
    js=$(compile "$TEST_DIR/simple.trp")

    start_socat_listener
    run_with_socket "$js"
    stop_socat_listener

    if sock_data | grep -q '"type":"process-exit"' && sock_data | grep -q '"exitCode":0'; then
        pass "$name"
    else
        fail "$name" "expected process-exit with exitCode 0 in socket data"
        echo "        socket data: $(sock_data)"
    fi
    cleanup_tmpdir
}

# Test 6: Message ordering -- main-thread-result appears before process-exit
test_message_ordering() {
    local name="Data: main-thread-result appears before process-exit"
    make_tmpdir
    local js
    js=$(compile "$TEST_DIR/simple.trp")

    start_socat_listener
    run_with_socket "$js"
    stop_socat_listener

    local result_line exit_line
    result_line=$(sock_data | grep -n '"type":"main-thread-result"' | head -1 | cut -d: -f1)
    exit_line=$(sock_data | grep -n '"type":"process-exit"' | head -1 | cut -d: -f1)

    if [ -n "$result_line" ] && [ -n "$exit_line" ] && [ "$result_line" -lt "$exit_line" ]; then
        pass "$name"
    else
        fail "$name" "main-thread-result (line $result_line) should appear before process-exit (line $exit_line)"
        echo "        socket data: $(sock_data)"
    fi
    cleanup_tmpdir
}

# Test 7: Multi-thread -- main finishes before spawned thread
test_multithread() {
    local name="Data: multi-thread program sends both messages with value 100"
    make_tmpdir
    local js
    js=$(compile "$TEST_DIR/multithread.trp")

    start_socat_listener
    run_with_socket "$js"
    stop_socat_listener

    local has_result has_exit has_100
    has_result=$(sock_data | grep -c '"type":"main-thread-result"' || true)
    has_exit=$(sock_data | grep -c '"type":"process-exit"' || true)
    has_100=$(sock_data | grep -c '"value":"100' || true)

    if [ "$has_result" -ge 1 ] && [ "$has_exit" -ge 1 ] && [ "$has_100" -ge 1 ]; then
        pass "$name"
    else
        fail "$name" "expected main-thread-result with 100 and process-exit"
        echo "        socket data: $(sock_data)"
    fi
    cleanup_tmpdir
}

# Test 8: Timeout sends process-exit with reason
test_timeout() {
    local name="Data: timeout sends process-exit with reason 'timeout'"
    make_tmpdir
    local js
    js=$(compile "$TEST_DIR/longrunning.trp")

    start_socat_listener
    run_with_socket "$js" --timeout=2
    stop_socat_listener

    if sock_data | grep -q '"type":"process-exit"' && sock_data | grep -q '"reason":"timeout"'; then
        pass "$name"
    else
        fail "$name" "expected process-exit with reason 'timeout' in socket data"
        echo "        socket data: $(sock_data)"
    fi
    cleanup_tmpdir
}

test_regression_stdout
test_stdout_suppressed
test_no_listener
test_main_thread_result
test_process_exit
test_message_ordering
test_multithread
test_timeout

echo ""
echo "Results: $PASSED passed, $FAILED failed, $((PASSED + FAILED)) total"
exit $((FAILED > 0 ? 1 : 0))
