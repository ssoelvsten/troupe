#!/bin/bash
set -euo pipefail

# Troupe Multi-Node Test Runner - Refactored Version
# Orchestrates multi-node tests with proper cleanup and output synchronization

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TROUPE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_CONFIG=""
CLEANUP_PIDS=()
TEMP_DIR=""
VERBOSE=false
RELAY_MULTIADDR=""
RELAY_PID=""

usage() {
    cat << EOF
Usage: $0 [options] <test-config.json>

Options:
    -v, --verbose       Enable verbose output
    -h, --help         Show this help message

Arguments:
    test-config.json   Configuration file for the multi-node test

Examples:
    $0 tests/rt/multinode-tests/basic-echo/config.json
    $0 -v tests/rt/multinode-tests/consensus/raft.json
EOF
}

cleanup() {
    log "Cleaning up test processes..."
    
    # Kill relay first if it exists
    if [[ -n "$RELAY_PID" ]] && kill -0 "$RELAY_PID" 2>/dev/null; then
        kill "$RELAY_PID" 2>/dev/null || true
        sleep 0.5
        kill -9 "$RELAY_PID" 2>/dev/null || true
    fi
    
    # Kill all spawned node processes
    if [[ ${#CLEANUP_PIDS[@]} -gt 0 ]]; then
        for pid in "${CLEANUP_PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
            fi
        done
        
        # Give processes time to clean up
        sleep 1
        
        # Force kill remaining processes
        for pid in "${CLEANUP_PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
    fi
    
    # Clean up temporary directory
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
    
    # Kill any remaining troupe processes
    pkill -f "node.*troupe" || true
}

trap cleanup EXIT INT TERM

log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[$(date '+%H:%M:%S')] $*" >&2
    fi
}

error() {
    echo "Error: $*" >&2
    exit 1
}

parse_config() {
    local config_file="$1"
    
    if [[ ! -f "$config_file" ]]; then
        error "Configuration file '$config_file' not found"
    fi
    
    # Validate JSON format
    if ! jq empty "$config_file" 2>/dev/null; then
        error "Invalid JSON in configuration file"
    fi
    
    TEST_CONFIG="$config_file"
}

setup_network_identities() {
    local test_dir="$1"
    local config_file="$2"
    
    log "Setting up network identities..."
    
    # Create identities directory
    mkdir -p "$test_dir/ids"
    
    # Generate node identities
    local node_count
    node_count=$(jq -r '.nodes | length' "$config_file")
    
    for ((i=0; i<node_count; i++)); do
        local node_id
        node_id=$(jq -r ".nodes[$i].id" "$config_file")
        local id_file="$test_dir/ids/$node_id.json"
        
        if [[ ! -f "$id_file" ]]; then
            log "Generating identity for node $node_id"
            node "$TROUPE_ROOT/p2p-tools/built/mkid.mjs" --outfile="$id_file"
        fi
    done
    
    # Generate aliases file
    local aliases_file="$test_dir/aliases.json"
    log "Generating aliases file"
    node "$TROUPE_ROOT/p2p-tools/built/mkaliases.js" \
        --include "$test_dir/ids"/*.json \
        --outfile "$aliases_file"
}

ensure_relay_built() {
    local relay_dir="$TROUPE_ROOT/p2p-tools/relay"
    local relay_built="$relay_dir/relay.mjs"
    
    # Check if built file exists
    if [[ -f "$relay_built" ]]; then
        log "Relay is already built"
        return 0
    fi
    
    log "Building relay server..."
    
    # Build the relay
    cd "$relay_dir"
    if ! make build/relay; then
        error "Failed to build relay server"
    fi
    
    cd "$TROUPE_ROOT"
    
    # Verify the build succeeded
    if [[ ! -f "$relay_built" ]]; then
        error "Relay build completed but output file not found"
    fi
    
    log "Relay server built successfully"
}

start_relay() {
    local config_file="$1"
    local use_relay
    use_relay=$(jq -r '.network.use_relay // true' "$config_file")
    
    if [[ "$use_relay" != "true" ]]; then
        log "Relay disabled by configuration"
        return 0
    fi
    
    # Check if relay address is provided in config
    local relay_address
    relay_address=$(jq -r '.network.relay_address // ""' "$config_file")
    
    if [[ -n "$relay_address" ]]; then
        # Use provided relay address
        RELAY_MULTIADDR="$relay_address"
        log "Using configured relay address: $RELAY_MULTIADDR"
        return 0
    fi
    
    # Start local relay
    ensure_relay_built
    
    # Generate relay keys in temp directory
    local relay_keys_dir="$TEMP_DIR/relay-keys"
    mkdir -p "$relay_keys_dir"
    
    log "Generating temporary relay keys..."
    node "$TROUPE_ROOT/p2p-tools/built/mkid.mjs" \
        --privkeyfile="$relay_keys_dir/relay.priv" \
        --idfile="$relay_keys_dir/relay.id" \
         >&2
    
    local relay_port
    relay_port=$(jq -r '.network.relay_port // 5555' "$config_file")
    
    log "Starting relay server on port $relay_port"
    
    # Create a temporary file for relay output
    local relay_output="$TEMP_DIR/relay.out"
    
    # Start relay in background
    DEBUG=libp2p:circuit-relay:server node "$TROUPE_ROOT/p2p-tools/relay/relay.mjs" \
        --port="$relay_port" \
        --id-file="$relay_keys_dir/relay.id" \
        --priv-file="$relay_keys_dir/relay.priv" \
        > "$relay_output" 2>&1 &
    
    RELAY_PID=$!
    
    # Wait for relay to be ready
    local wait_count=0
    while [[ $wait_count -lt 30 ]]; do
        if ! kill -0 "$RELAY_PID" 2>/dev/null; then
            cat "$relay_output" >&2
            error "Relay server failed to start"
        fi
        
        # Check if relay has output its address
        if grep -q "Listening on:" "$relay_output" 2>/dev/null; then
            # Extract the WebSocket multiaddr with peer ID
            RELAY_MULTIADDR=$(grep -A 10 "Listening on:" "$relay_output" | \
                grep "/ws/p2p/" | head -1 | \
                sed 's/.*\(\/ip4\/.*\)/\1/' | xargs)
            
            if [[ -n "$RELAY_MULTIADDR" ]]; then
                log "Relay server started (PID: $RELAY_PID)"
                log "Relay multiaddr: $RELAY_MULTIADDR"
                return 0
            fi
        fi
        
        sleep 0.5
        ((wait_count++))
    done
    
    cat "$relay_output" >&2
    error "Failed to get relay multiaddr"
}

run_node() {
    local config_file="$1"
    local node_index="$2"
    local test_dir="$3"
    local output_dir="$4"
    
    local node_config
    node_config=$(jq -r ".nodes[$node_index]" "$config_file")
    
    local node_id script port start_delay expected_exit_code extra_argv
    node_id=$(echo "$node_config" | jq -r '.id')
    script=$(echo "$node_config" | jq -r '.script')
    port=$(echo "$node_config" | jq -r '.port')
    start_delay=$(echo "$node_config" | jq -r '.start_delay // 0')
    expected_exit_code=$(echo "$node_config" | jq -r '.expected_exit_code // 0')
    extra_argv=$(echo "$node_config" | jq -r '.extra_argv // ""')
    
    log "Starting node $node_id (delay: ${start_delay}s)"
    
    # Apply start delay
    if [[ "$start_delay" -gt 0 ]]; then
        sleep "$start_delay"
    fi
    
    # Prepare paths
    local script_path="$test_dir/$script"
    if [[ ! -f "$script_path" ]]; then
        error "Script '$script_path' not found for node $node_id"
    fi
    
    local id_file="$test_dir/ids/$node_id.json"
    local aliases_file="$test_dir/aliases.json"
    local output_file="$output_dir/$node_id.out"
    local error_file="$output_dir/$node_id.err"
    
    # Build command
    local cmd_args=(
        "./network.sh"
        "$script_path"
        "--id" "$id_file"
        "--aliases" "$aliases_file"
        "--port" "$port"
    )
    
    # Add relay parameter if available
    if [[ -n "$RELAY_MULTIADDR" ]]; then
        cmd_args+=("--relay" "$RELAY_MULTIADDR")
    fi
    
    # Add extra arguments if provided
    if [[ -n "$extra_argv" ]]; then
        # Parse extra_argv as shell arguments
        eval "extra_args=($extra_argv)"
        cmd_args+=("${extra_args[@]}")
    fi
    
    log "Executing: ${cmd_args[*]}"
    
    # Run the node
    cd "$TROUPE_ROOT"
    
    local timeout_val
    timeout_val=$(jq -r '.timeout // 30' "$config_file")
    
    if [[ "$VERBOSE" == "true" ]]; then
        # In verbose mode, show prefixed output
        timeout "$timeout_val" "${cmd_args[@]}" \
            > >(tee "$output_file" | sed "s/^/[$node_id:out] /" >&2) \
            2> >(tee "$error_file" | sed "s/^/[$node_id:err] /" >&2) &
    else
        # Normal mode: just redirect to files
        timeout "$timeout_val" "${cmd_args[@]}" \
            > "$output_file" 2> "$error_file" &
    fi
    
    local node_pid=$!
    CLEANUP_PIDS+=("$node_pid")
    
    log "Node $node_id started (PID: $node_pid)"
    
    # Wait for node completion
    local actual_exit_code=0
    wait "$node_pid" || actual_exit_code=$?
    
    # Handle timeout exit code (124)
    if [[ "$actual_exit_code" == "124" ]]; then
        log "Node $node_id timed out after ${timeout_val}s"
        if [[ "$expected_exit_code" != "124" ]]; then
            error "Node $node_id timed out unexpectedly"
        fi
    elif [[ "$actual_exit_code" != "$expected_exit_code" ]]; then
        error "Node $node_id exited with code $actual_exit_code, expected $expected_exit_code"
    fi
    
    log "Node $node_id completed successfully"
}

merge_outputs() {
    local config_file="$1"
    local output_dir="$2"
    
    local merge_strategy
    merge_strategy=$(jq -r '.output.merge_strategy // "timestamp"' "$config_file")
    
    log "Merging outputs (strategy: $merge_strategy)"
    
    case "$merge_strategy" in
        "timestamp")
            # Merge all outputs in a consistent order
            # Sort by filename to ensure consistent ordering (client before server)
            # Apply filtering to remove timestamps, UUIDs, etc.
            find "$output_dir" -name "*.out" | sort | xargs cat | \
                "$TROUPE_ROOT/tests/_util/filter.sh"
            ;;
        "sequential")
            # Concatenate outputs in node order
            local node_count
            node_count=$(jq -r '.nodes | length' "$config_file")
            
            for ((i=0; i<node_count; i++)); do
                local node_id
                node_id=$(jq -r ".nodes[$i].id" "$config_file")
                
                if [[ -f "$output_dir/$node_id.out" ]]; then
                    echo "=== Output from $node_id ==="
                    cat "$output_dir/$node_id.out" | "$TROUPE_ROOT/tests/_util/filter.sh"
                    echo
                fi
            done
            ;;
        "per_node")
            # Output each node separately without filtering
            local node_count
            node_count=$(jq -r '.nodes | length' "$config_file")
            
            for ((i=0; i<node_count; i++)); do
                local node_id
                node_id=$(jq -r ".nodes[$i].id" "$config_file")
                
                if [[ -f "$output_dir/$node_id.out" ]]; then
                    echo "NODE:$node_id"
                    cat "$output_dir/$node_id.out"
                fi
            done
            ;;
        *)
            error "Unknown merge strategy: $merge_strategy"
            ;;
    esac
}

run_test() {
    local config_file="$1"
    
    # Set up temporary directory for this test run
    TEMP_DIR=$(mktemp -d -t troupe-multinode-XXXXXX)
    local output_dir="$TEMP_DIR/output"
    mkdir -p "$output_dir"
    
    # Get test directory
    local test_dir
    test_dir=$(dirname "$(realpath "$config_file")")
    
    local test_name
    test_name=$(jq -r '.test_name' "$config_file")
    
    log "Running multi-node test: $test_name"
    log "Test directory: $test_dir"
    log "Output directory: $output_dir"
    
    # Setup phase
    setup_network_identities "$test_dir" "$config_file"
    start_relay "$config_file"
    
    # Execution phase
    local coordination
    coordination=$(jq -r '.coordination // "parallel"' "$config_file")
    
    local node_count
    node_count=$(jq -r '.nodes | length' "$config_file")
    
    case "$coordination" in
        "parallel")
            # Start all nodes simultaneously
            local node_pids=()
            for ((i=0; i<node_count; i++)); do
                run_node "$config_file" "$i" "$test_dir" "$output_dir" &
                node_pids+=($!)
            done
            
            # Wait for all nodes
            local failed=false
            for pid in "${node_pids[@]}"; do
                if ! wait "$pid"; then
                    failed=true
                fi
            done
            
            if [[ "$failed" == "true" ]]; then
                error "One or more nodes failed"
            fi
            ;;
        "sequential")
            # Start nodes one after another
            for ((i=0; i<node_count; i++)); do
                run_node "$config_file" "$i" "$test_dir" "$output_dir"
            done
            ;;
        *)
            error "Unknown coordination strategy: $coordination"
            ;;
    esac
    
    # Output phase
    merge_outputs "$config_file" "$output_dir"
    
    log "Multi-node test completed successfully"
}

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            -*)
                error "Unknown option: $1"
                ;;
            *)
                if [[ -z "$TEST_CONFIG" ]]; then
                    TEST_CONFIG="$1"
                else
                    error "Multiple configuration files specified"
                fi
                shift
                ;;
        esac
    done
    
    if [[ -z "$TEST_CONFIG" ]]; then
        error "No configuration file specified"
    fi
    
    parse_config "$TEST_CONFIG"
    run_test "$TEST_CONFIG"
}

main "$@"