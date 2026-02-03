# Cross-Spawn Test

This test demonstrates remote process spawning capabilities in Troupe.

## Overview

- **Server**: Registers a "spawner" service that can create remote processes
- **Client**: Requests the server to spawn a process on the client's node
- **Pattern**: Client requests spawn → Server spawns on client node → Remote process executes

The test verifies that processes can be spawned across node boundaries with proper authority delegation.

## Key Configuration Options

- **coordination**: "parallel" - Nodes start together for spawn timing
- **start_delay**: 2 seconds for client - Extra time for spawner service setup
- **timeout**: 60 seconds - Accounts for remote spawn overhead
- **expected_exit_code**: 
  - Server: 0 - Confirms successful spawn operation
  - Client: 42 - Custom exit code from remotely spawned process