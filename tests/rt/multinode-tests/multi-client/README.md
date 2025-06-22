# Multi-Client Test

This test demonstrates a server handling multiple concurrent clients.

## Overview

- **Server**: Registers an "echo" service and handles messages from multiple clients
- **Client1 & Client2**: Both clients send messages to the same server
- **Pattern**: Multiple clients → Server → Individual responses

The server processes requests from both clients and responds to each individually, demonstrating concurrent message handling.

## Key Configuration Options

- **coordination**: "parallel" - All nodes start simultaneously
- **start_delay**: 
  - Client1: 2 seconds - First client connects
  - Client2: 3 seconds - Second client connects slightly later
- **timeout**: 60 seconds - Allows for multiple message exchanges
- **expected_exit_code**: 0 for all nodes - Validates all communications succeeded
- **ports**: Unique ports (6789-6791) prevent connection conflicts