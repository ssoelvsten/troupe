# P2P Peer Discovery Bug Reproduction

This folder contains a minimal reproduction case for the peer discovery bug in local multinode tests.

## The Bug

When two Troupe nodes connect to the same local relay, they cannot discover each other via `whereis()`. The client fails with either a timeout or a `NO_RESERVATION` error.

**Root causes** (two related issues):

1. **Peer discovery failure**: The relay is a pure circuit relay - it forwards traffic but doesn't help peers discover each other. The DHT uses global bootstrap nodes that don't know about ephemeral local test peers.

2. **Circuit relay v2 reservation**: In libp2p circuit relay v2, peers must make a *reservation* with the relay before other peers can connect through it. The current implementation connects to the relay but doesn't set up listening/reservations.

## Quick Reproduction

```bash
# From this directory:
./run.sh
```

This will:
1. **Regenerate fresh identities** (important - cached peer info can cause false passes)
2. Start a local relay
3. Start a server node that registers an "echo" service
4. Start a client node that tries to find the server via `whereis("@server", "echo")`
5. The client will hang at the `whereis` call (timeout after 10 seconds)

**Note:** The script regenerates identities each run to ensure the bug is reliably reproduced. If identities are reused, mDNS discovery may occasionally work and the test may pass.

## Expected vs Actual Behavior

**Expected:**
```
SERVER: Starting echo server
SERVER: Registered echo service
CLIENT: Starting echo client
CLIENT: Found echo server        <-- This should happen
CLIENT: Test passed
```

**Actual (with --relay-only):**
```
SERVER: Starting echo server
SERVER: Registered echo service
CLIENT: Starting echo client
CLIENT: Looking for server via whereis...
InvalidMessageError: failed to connect via relay with status NO_RESERVATION
```

**Actual (without --relay-only):**
```
SERVER: Starting echo server
SERVER: Registered echo service
CLIENT: Starting echo client
CLIENT: Timeout - could not find server   <-- DHT lookup times out
```

## Manual Step-by-Step Reproduction

If you want to run each component manually to see the logs:

### Terminal 1: Start the relay
```bash
cd $TROUPE
node p2p-tools/relay/relay.mjs --port=15555 \
    --id-file=tests/_unautomated/p2pbug/keys/relay.id \
    --priv-file=tests/_unautomated/p2pbug/keys/relay.priv
```

### Terminal 2: Start the server
```bash
cd $TROUPE
./network.sh tests/_unautomated/p2pbug/server.trp \
    --id tests/_unautomated/p2pbug/ids/server.json \
    --aliases tests/_unautomated/p2pbug/aliases.json \
    --port 16789 \
    --relay "/ip4/127.0.0.1/tcp/15555/ws/p2p/$(cat tests/_unautomated/p2pbug/keys/relay.id)"
```

### Terminal 3: Start the client (after server has registered)
```bash
cd $TROUPE
./network.sh tests/_unautomated/p2pbug/client.trp \
    --id tests/_unautomated/p2pbug/ids/client.json \
    --aliases tests/_unautomated/p2pbug/aliases.json \
    --port 16790 \
    --relay "/ip4/127.0.0.1/tcp/15555/ws/p2p/$(cat tests/_unautomated/p2pbug/keys/relay.id)"
```

## What Happens Internally

1. **Server** connects to relay, registers "echo" service locally
2. **Client** connects to relay, calls `whereis("@server", "echo")`
3. `whereis` triggers peer discovery for "@server" node
4. Runtime calls `peerRouting.findPeer(serverPeerId)` which queries DHT
5. DHT queries go to global bootstrap nodes (bootstrap.libp2p.io)
6. Global nodes don't know about the ephemeral local server
7. `findPeer` times out, `whereis` hangs

## Current Discovery Mechanisms (All Fail)

The runtime currently enables three discovery mechanisms (hardcoded in `rt/src/p2p/p2p.mts`):

1. **DHT (Kademlia)** - Queries global bootstrap nodes at `bootstrap.libp2p.io`
   - These nodes don't know about ephemeral local test peers
   - Always fails for local-only tests

2. **mDNS** - Local network multicast discovery
   - Needs time to propagate (race condition with whereis)
   - May not work in all environments (Docker, CI, etc.)
   - Not reliable for quick test scenarios

3. **Bootstrap nodes** - Static list of public libp2p nodes
   - Same problem as DHT - global nodes don't know local peers

**None of these help when peers need to discover each other through a local relay.**

### Deterministic Testing with --relay-only

The `--relay-only` flag (added to make this bug deterministic) disables DHT, mDNS, and bootstrap discovery. With this flag:
- Nodes can ONLY connect through the relay
- The bug is 100% reproducible
- The error is clear: `NO_RESERVATION` or timeout

Without `--relay-only`, mDNS might occasionally succeed, causing flaky test results.

## Proposed Fix: Relay as Rendezvous

The relay should track connected peers and share this information:
1. When a peer connects to the relay, the relay notifies other connected peers
2. Peers add each other to their peer stores
3. `whereis` finds peers via peer store without needing DHT

## Files

- `server.trp` - Minimal server that registers a service
- `client.trp` - Minimal client that tries to find the server
- `run.sh` - Script to reproduce the bug
- `setup.sh` - Generates keys and aliases (called by run.sh)
- `config.json` - Configuration for multinode-runner (optional)
