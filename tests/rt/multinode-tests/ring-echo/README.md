# Ring Echo Test

This test demonstrates a ring-style communication pattern with message forwarding.

## Overview

- **Client**: Initiates communication by sending to an intermediary
- **Intermediary**: Forwards the message to the echo server
- **Server**: Responds directly back to the client (bypassing intermediary)
- **Pattern**: Client → Intermediary → Server → Client

This creates a ring communication pattern where the request flows through an intermediary but the response returns directly.

## Key Configuration Options

- **coordination**: "parallel" - All nodes start together
- **start_delay**:
  - Intermediary: 1 second - Registers proxy service first
  - Client: 3 seconds - Ensures all services are ready
- **expected_exit_code**:
  - Server & Client: 0 - Complete after message exchange
  - Intermediary: 124 - Timeout (continues running as proxy)
- **timeout**: 60 seconds - Covers forwarding delays