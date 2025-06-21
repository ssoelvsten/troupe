#!/bin/bash
set -euo pipefail

# Troupe Multi-Node Test Runner
# Orchestrates multi-node tests with proper cleanup and output synchronization

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TROUPE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_CONFIG=""
CLEANUP_PIDS=()
TEMP_DIR=""
VERBOSE=false
RELAY_MULTIADDR=""

usage() {
    cat << EOF
Usage: $0 [options] <test-config.json>

Options:
    -v, --verbose       Enable verbose output
    -h, --help         Show this help message

Arguments:
    test-config.json   Configuration file for the multi-node test

Examples:
    $0 tests/rt/multinode/echo/config.json
    $0 -v tests/rt/multinode/consensus/raft.json
EOF
}

cleanup() {
    echo "Cleaning up test processes..."
    
    # Kill all spawned processes
    for pid in "${CLEANUP_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            sleep 0.5
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    
    # Clean up temporary directory
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
    
    # Kill any remaining troupe processes
    pkill -f "node.*troupe" || true
    sleep 1
}

trap cleanup EXIT INT TERM

log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[$(date '+%H:%M:%S')] $*" >&2
    fi
}

parse_config() {
    local config_file="$1"
    
    if [[ ! -f "$config_file" ]]; then
        echo "Error: Configuration file '$config_file' not found" >&2
        exit 1
    fi
    
    # Validate JSON format
    if ! jq empty "$config_file" 2>/dev/null; then
        echo "Error: Invalid JSON in configuration file" >&2
        exit 1
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
    if [[ ! -f "$aliases_file" ]] || [[ "$test_dir/ids" -nt "$aliases_file" ]]; then
        log "Generating aliases file"
        node "$TROUPE_ROOT/p2p-tools/built/mkaliases.js" \
            --include "$test_dir/ids"/*.json \
            --outfile "$aliases_file"
    fi
}

ensure_relay_built() {
    local relay_dir="$TROUPE_ROOT/p2p-tools/relay"
    local relay_source="$relay_dir/relay.mts"
    local relay_built="$relay_dir/relay.mjs"
    
    # Check if source exists
    if [[ ! -f "$relay_source" ]]; then
        echo "Error: Relay source file not found: $relay_source" >&2
        exit 1
    fi
    
    # Check if built file exists and is newer than source
    if [[ -f "$relay_built" && "$relay_built" -nt "$relay_source" ]]; then
        log "Relay is already built and up-to-date"
        return 0
    fi
    
    log "Building relay server..."
    
    # Build the relay using its Makefile
    cd "$relay_dir"
    if ! make build/relay; then
        echo "Error: Failed to build relay server" >&2
        exit 1
    fi
    
    # Return to original directory
    cd "$TROUPE_ROOT"
    
    # Verify the build succeeded
    if [[ ! -f "$relay_built" ]]; then
        echo "Error: Relay build completed but output file not found" >&2
        exit 1
    fi
    
    log "Relay server built successfully"
}

start_relay_if_needed() {
    local config_file="$1"
    local use_relay
    use_relay=$(jq -r '.network.use_relay // true' "$config_file")
    
    if [[ "$use_relay" == "true" ]]; then
        # Check if relay address is provided in config
        local relay_address
        relay_address=$(jq -r '.network.relay_address // ""' "$config_file")
        
        if [[ -n "$relay_address" ]]; then
            # Use provided relay address
            RELAY_MULTIADDR="$relay_address"
            log "Using configured relay address: $RELAY_MULTIADDR"
        else
            # Start local relay
            ensure_relay_built
            
            # Generate relay keys in temp directory
            local relay_keys_dir="$TEMP_DIR/relay-keys"
            mkdir -p "$relay_keys_dir"
            
            log "Generating temporary relay keys..."
            node "$TROUPE_ROOT/p2p-tools/built/mkid.mjs" \
                --privkeyfile="$relay_keys_dir/relay.priv" \
                --idfile="$relay_keys_dir/relay.id" \
                --verbose >&2
            
            if [[ ! -f "$relay_keys_dir/relay.id" || ! -f "$relay_keys_dir/relay.priv" ]]; then
                echo "Error: Failed to generate relay keys" >&2
                exit 1
            fi
            
            local relay_port
            relay_port=$(jq -r '.network.relay_port // 5555' "$config_file")
            
            log "Starting relay server on port $relay_port"
            
            # Create a temporary file for relay output
            local relay_output="$TEMP_DIR/relay.out"
            
            # Start relay in background with custom port and key files
            DEBUG=libp2p:circuit-relay:server node "$TROUPE_ROOT/p2p-tools/relay/relay.mjs" \
                --port="$relay_port" \
                --id-file="$relay_keys_dir/relay.id" \
                --priv-file="$relay_keys_dir/relay.priv" \
                > "$relay_output" 2>&1 &
            local relay_pid=$!
            CLEANUP_PIDS+=("$relay_pid")
            
            # Wait for relay to be ready and extract multiaddr
            local wait_count=0
            while [[ $wait_count -lt 30 ]]; do
                if ! kill -0 "$relay_pid" 2>/dev/null; then
                    echo "Error: Relay server failed to start" >&2
                    cat "$relay_output" >&2
                    exit 1
                fi
                
                # Check if relay has output its address
                if grep -q "Listening on:" "$relay_output" 2>/dev/null; then
                    # Extract the WebSocket multiaddr with peer ID, removing timestamp prefix
                    RELAY_MULTIADDR=$(grep -A 10 "Listening on:" "$relay_output" | grep "/ws/p2p/" | head -1 | sed 's/.*\(\/ip4\/.*\)/\1/' | xargs)
                    if [[ -n "$RELAY_MULTIADDR" ]]; then
                        log "Relay server started (PID: $relay_pid)"
                        log "Relay multiaddr: $RELAY_MULTIADDR"
                        break
                    fi
                fi
                
                sleep 0.5
                ((wait_count++))
            done
            
            if [[ -z "$RELAY_MULTIADDR" ]]; then
                echo "Error: Failed to get relay multiaddr" >&2
                cat "$relay_output" >&2
                exit 1
            fi
        fi
    fi
}

run_node() {
    local config_file="$1"
    local node_index="$2"
    local test_dir="$3"
    local output_dir="$4"
    
    local node_config
    node_config=$(jq -r ".nodes[$node_index]" "$config_file")
    
    local node_id script port start_delay expected_exit_code
    node_id=$(echo "$node_config" | jq -r '.id')
    script=$(echo "$node_config" | jq -r '.script')
    port=$(echo "$node_config" | jq -r '.port')
    start_delay=$(echo "$node_config" | jq -r '.start_delay // 0')
    expected_exit_code=$(echo "$node_config" | jq -r '.expected_exit_code // 0')
    
    log "Starting node $node_id (delay: ${start_delay}s)"
    
    # Apply start delay
    if [[ "$start_delay" -gt 0 ]]; then
        sleep "$start_delay"
    fi
    
    # Set up node environment
    local node_env
    node_env=$(echo "$node_config" | jq -r '.env // {}')
    
    # Prepare command
    local script_path="$test_dir/$script"
    if [[ ! -f "$script_path" ]]; then
        echo "Error: Script '$script_path' not found for node $node_id" >&2
        return 1
    fi
    
    local id_file="$test_dir/ids/$node_id.json"
    local aliases_file="$test_dir/aliases.json"
    local output_file="$output_dir/$node_id.out"
    local error_file="$output_dir/$node_id.err"
    
    # Run the node
    cd "$TROUPE_ROOT"
    
    export NODE_ID="$node_id"
    if [[ "$node_env" != "{}" ]]; then
        # Export additional environment variables
        while IFS="=" read -r key value; do
            export "$key"="$value"
        done < <(echo "$node_env" | jq -r 'to_entries | .[] | "\(.key)=\(.value)"')
    fi
    
    # Build command with optional relay parameter
    local cmd_args=("./network.sh" "$script_path" "--id" "$id_file" "--aliases" "$aliases_file" "--port" "$port")
    
    # Add relay parameter if available
    if [[ -n "$RELAY_MULTIADDR" ]]; then
        cmd_args+=("--relay" "$RELAY_MULTIADDR")
    fi
    
    log "Executing command: ${cmd_args[*]}"
    
    timeout "$(jq -r '.timeout // 30' "$config_file")" \
        "${cmd_args[@]}" \
        > "$output_file" 2> "$error_file" &
    
    local node_pid=$!
    CLEANUP_PIDS+=("$node_pid")
    
    log "Node $node_id started (PID: $node_pid)"
    
    # Wait for node completion
    local actual_exit_code=0
    wait "$node_pid" || actual_exit_code=$?
    
    if [[ "$actual_exit_code" != "$expected_exit_code" ]]; then
        echo "Error: Node $node_id exited with code $actual_exit_code, expected $expected_exit_code" >&2
        return 1
    fi
    
    log "Node $node_id completed successfully"
}

merge_outputs() {
    local config_file="$1"
    local output_dir="$2"
    
    local merge_strategy
    merge_strategy=$(jq -r '.output.merge_strategy // "timestamp"' "$config_file")
    
    local filter_patterns
    filter_patterns=$(jq -r '.output.filter_patterns // ["uuid", "timestamp", "peer_id"] | join(",")' "$config_file")
    
    log "Merging outputs (strategy: $merge_strategy)"
    
    case "$merge_strategy" in
        "timestamp")
            # Merge by timestamp, filtering common patterns
            find "$output_dir" -name "*.out" -exec cat {} \; | \
                sort | \
                "$TROUPE_ROOT/tests/_util/diff.sh" /dev/stdin /dev/stdout
            ;;
        "sequential")
            # Concatenate outputs in node order
            local node_count
            node_count=$(jq -r '.nodes | length' "$config_file")
            
            for ((i=0; i<node_count; i++)); do
                local node_id
                node_id=$(jq -r ".nodes[$i].id" "$config_file")
                
                echo "=== Output from $node_id ==="
                cat "$output_dir/$node_id.out" | \
                    "$TROUPE_ROOT/tests/_util/diff.sh" /dev/stdin /dev/stdout
                echo
            done
            ;;
        "per_node")
            # Output each node separately
            local node_count
            node_count=$(jq -r '.nodes | length' "$config_file")
            
            for ((i=0; i<node_count; i++)); do
                local node_id
                node_id=$(jq -r ".nodes[$i].id" "$config_file")
                
                echo "NODE:$node_id"
                cat "$output_dir/$node_id.out"
            done
            ;;
    esac
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
                echo "Unknown option: $1" >&2
                usage
                exit 1
                ;;
            *)
                if [[ -z "$TEST_CONFIG" ]]; then
                    TEST_CONFIG="$1"
                else
                    echo "Error: Multiple configuration files specified" >&2
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    if [[ -z "$TEST_CONFIG" ]]; then
        echo "Error: No configuration file specified" >&2
        usage
        exit 1
    fi
    
    parse_config "$TEST_CONFIG"
    
    # Set up temporary directory for this test run
    TEMP_DIR=$(mktemp -d -t troupe-multinode-XXXXXX)
    local output_dir="$TEMP_DIR/output"
    mkdir -p "$output_dir"
    
    # Get test directory
    local test_dir
    test_dir=$(dirname "$(realpath "$TEST_CONFIG")")
    
    log "Running multi-node test: $(jq -r '.test_name' "$TEST_CONFIG")"
    log "Test directory: $test_dir"
    log "Output directory: $output_dir"
    
    # Setup phase
    setup_network_identities "$test_dir" "$TEST_CONFIG"
    start_relay_if_needed "$TEST_CONFIG"
    
    # Execution phase
    local coordination
    coordination=$(jq -r '.coordination // "parallel"' "$TEST_CONFIG")
    
    local node_count
    node_count=$(jq -r '.nodes | length' "$TEST_CONFIG")
    
    case "$coordination" in
        "parallel")
            # Start all nodes simultaneously
            local node_pids=()
            for ((i=0; i<node_count; i++)); do
                run_node "$TEST_CONFIG" "$i" "$test_dir" "$output_dir" &
                node_pids+=($!)
            done
            
            # Wait for all nodes
            for pid in "${node_pids[@]}"; do
                wait "$pid"
            done
            ;;
        "sequential")
            # Start nodes one after another
            for ((i=0; i<node_count; i++)); do
                run_node "$TEST_CONFIG" "$i" "$test_dir" "$output_dir"
            done
            ;;
        *)
            echo "Error: Unknown coordination strategy: $coordination" >&2
            exit 1
            ;;
    esac
    
    # Output phase
    merge_outputs "$TEST_CONFIG" "$output_dir"
    
    log "Multi-node test completed successfully"
}

main "$@"