# Basic Echo Test

This test demonstrates basic inter-node communication in Troupe.

## Overview

- **Server**: Registers an "echo" service and waits for one message
- **Client**: Discovers the echo service and sends a test message
- **Pattern**: Client → Server → Client

The server echoes back any message it receives, then both nodes exit successfully.

## Key Configuration Options

- **coordination**: "parallel" - Both nodes start simultaneously
- **start_delay**: 1 second for client - Ensures server registers before client queries
- **timeout**: 60 seconds - Sufficient for connection establishment and message exchange
- **expected_exit_code**: 0 for both nodes - Validates successful completion