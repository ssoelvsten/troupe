# Ring Echo with 3 Intermediaries

Extended version of ring-echo with 3 intermediary nodes.

## Overview

- **Pattern**: Client → Intermediary1 → Intermediary2 → Intermediary3 → Server → Client
- Messages flow through all 3 intermediaries sequentially before reaching the server
- Server responds directly to the client

See ring-echo for the basic pattern.

## Key Configuration Options

- **start_delay**:
  - All intermediaries: 1 second - Start together for chain setup
  - Client: 4 seconds - Waits for full proxy chain
- **ports**: 6789-6793 - Five unique ports for all nodes
- **expected_exit_code**: 124 for all intermediaries - Remain active as proxies
- **timeout**: 60 seconds - Accounts for multi-hop forwarding