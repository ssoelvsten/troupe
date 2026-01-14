# Quarantine Echo Example

This example demonstrates trust-based information flow control between two nodes with asymmetric trust.

## Scenario

- **Client** trusts the **Server** at level `{alice}`
- **Server** does NOT trust the **Client** at level `{alice}` (trusts at `BOT` only)

When the client sends information labeled at `{alice}` to the server:
1. The client can send because it trusts the server at that level
2. When the server receives the message, it gets downgraded to `BOT` because the server doesn't trust the client

This demonstrates runtime trust-based downgrading of information.

## Trust Configuration Approaches

### Static Approach (Recommended for this example)

Trust relationships are defined in trustmap JSON files that are loaded at node startup. This approach is:
- Simple and explicit
- Good for fixed network topologies
- Easy to understand and debug
- Suitable for examples and testing

### Programmatic Approach

Trust could also be configured at runtime. This would be useful for:
- Dynamic trust negotiation
- Trust that changes over time
- Complex trust policies

For this initial example, we use the static approach.

## Quick Start

```bash
cd examples/network/quarantine-echo-01
make setup   # First-time only: creates identifiers and trustmap
make run     # Runs both server and client
```

## Manual Setup (Alternative)

If you prefer to run server and client in separate terminals:

1. **First-time only**: Set up identifiers and trustmap:
   ```bash
   make setup
   ```

2. **Run the server** (in one terminal):
   ```bash
   make server
   ```

3. **Run the client** (in another terminal):
   ```bash
   make client
   ```

## Cleanup

```bash
make clean   # Removes generated files and kills any running server
```

## Expected Output

**Server output:**
```
SERVER: waiting for messages...
SERVER: Received echo request: Hello from alice
SERVER: Level of received msg: <;>   # BOT level - downgraded!
SERVER: Sent reply
```

**Client output:**
```
CLIENT: Starting echo client
CLIENT: Found echo server
CLIENT: Level of test_msg: <alice;alice>
CLIENT: Sending message at level {alice}
CLIENT: Received response: Hello from alice
CLIENT: Level of response: ...
```

The key observation is that the server sees the message at `BOT` level (`<;>`) even though the client sent it at `{alice}` level, because the server doesn't trust the client.

## Next Steps

This example is part of a series exploring quarantine mechanisms:
1. Basic skeleton (this example)
2. Accessing message metadata
3. Record-based metadata approach
4. Quarantine protocol
5. Gate call idiom
