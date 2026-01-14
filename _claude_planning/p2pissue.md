# P2P Multinode Test Infrastructure Issue

## Summary

The multinode test infrastructure has relay connectivity problems that cause tests to fail with `whereis` hanging or `NO_RESERVATION` errors.

## Symptoms

- Client nodes cannot find server nodes via `whereis("@server", "service-name")`
- Errors like: `InvalidMessageError: failed to connect via relay with status NO_RESERVATION`
- Tests timeout waiting for peer discovery

Example output:
```
"SERVER: Starting echo server"
"SERVER: Registered echo service"
"CLIENT: Starting echo client"
# Client hangs here, never finds server
```

## Context

This was discovered while creating a test for the graceful shutdown fix. The graceful shutdown fix itself works correctly (verified with standalone `network.sh` tests), but automated multinode tests using `scripts/multinode-runner.sh` fail due to this separate relay issue.

## Root Cause Analysis (2026-01-14)

### Issue 1: ErrorEvent Crash (FIXED)

Node.js 23 uses the native WebSocket API (via undici) instead of the `ws` package for client connections. When WebSocket connections fail, an `ErrorEvent` is thrown. The P2P error handling code (`processExpectedNetworkErrors` in `rt/src/p2p/p2p.mts`) didn't recognize `ErrorEvent` objects because they don't have `name` or `code` properties - they have a `type` property instead.

**Fix Applied:** Added handling for `ErrorEvent` in `processExpectedNetworkErrors()`:
```typescript
} else if(err && err.constructor && err.constructor.name === 'ErrorEvent') {
  // Handle ErrorEvent from native Node.js WebSocket (via undici)
  const target = err.target;
  const url = target && target[Symbol.for('nodejs.url')] ? target[Symbol.for('nodejs.url')] : 'unknown';
  error(`WebSocket connection failed to ${url}: ${err.message || 'connection error'}`);
  // Treat as a recoverable network error - don't throw
}
```

### Issue 2: Peer Discovery in Local Tests (SEPARATE ISSUE)

The `whereis` hanging is caused by DHT peer discovery challenges in local test environments:

1. Both server and client connect to the local relay successfully
2. The client tries to find the server using `peerRouting.findPeer()`
3. The DHT lookup uses the global libp2p bootstrap nodes, not the local relay
4. The local relay is just a circuit relay, not a DHT bootstrap node that tracks local peers
5. The server's address never gets propagated to a place where the client can find it

This is a fundamental limitation of how the current test infrastructure works - it relies on global DHT for peer discovery, which doesn't work for ephemeral local test peers.

**Potential Solutions:**
1. Add mDNS discovery (already enabled, but may need time to work)
2. Use `known_nodes` in p2pconfig to directly specify peer addresses
3. Have the relay also function as a rendezvous point for local peers
4. Use the relay's peer store to share peer information between connected nodes

## Observed Behavior

1. Relay starts successfully
2. Server node starts and registers service
3. Client node starts but cannot connect to server via relay
4. Both nodes timeout

## Not Related To

- The graceful shutdown fix (libp2p v3 pushable cleanup) - that fix is working correctly
- The test scripts themselves - they work when relay connectivity works

## Files Involved

- `scripts/multinode-runner.sh` - test orchestration
- `p2p-tools/relay/relay.mjs` - relay server
- `rt/src/p2p/p2p.mts` - node p2p implementation (ErrorEvent fix applied here)
- `rt/src/p2p/p2pconfig.mts` - relay configuration

## Status

- [x] ErrorEvent crash fixed
- [ ] Peer discovery for local tests needs further work
