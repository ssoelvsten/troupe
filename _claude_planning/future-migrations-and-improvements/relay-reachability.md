# Future Improvement: Relay Reachability Checks

## Problem Statement

Currently, when the Troupe P2P runtime starts, it immediately attempts to connect to configured relay servers and add circuit relay listen addresses. If a relay server is unreachable (due to network issues, server downtime, or misconfiguration), the libp2p node creation fails with a `TimeoutError`, preventing the node from starting entirely.

This is problematic because:
1. Users cannot run network-enabled Troupe programs when the default relay is unavailable
2. The error message is cryptic and doesn't guide users toward solutions
3. There's no graceful degradation - the entire P2P stack fails

## Current Mitigations

With the addition of `--disable-relay` and `--relay-fault-tolerance` CLI options, users now have workarounds:
- `--disable-relay`: Completely disables relay functionality
- `--relay-fault-tolerance=no-fatal`: Allows node to start even if relay connection fails

However, these are manual interventions that require user awareness of the issue.

## Proposed Future Improvement: Automatic Relay Reachability Checks

### Overview

Implement a proactive relay reachability check before attempting to add circuit relay listen addresses. If a relay is determined to be unreachable, either:
1. Skip that relay gracefully with a warning
2. Fall back to alternative relays
3. Continue without relay functionality

### Implementation Considerations

#### 1. Reachability Check Methods

**Option A: TCP Connection Test**
- Attempt a raw TCP connection to the relay's IP:port
- Pros: Fast, low overhead
- Cons: Doesn't verify the relay protocol is actually running

**Option B: libp2p Ping**
- Use libp2p's ping protocol to verify relay is responding
- Pros: Validates the full libp2p stack
- Cons: Requires partial node setup first, chicken-and-egg problem

**Option C: HTTP Health Endpoint**
- If relay exposes an HTTP health endpoint, check that
- Pros: Can provide detailed status information
- Cons: Requires relay modification, not standard libp2p

**Recommended: Option A with timeout**
```typescript
async function isRelayReachable(relayMultiaddr: string, timeoutMs: number = 5000): Promise<boolean> {
  // Parse multiaddr to extract IP and port
  // Attempt TCP connection with timeout
  // Return true if connection succeeds, false otherwise
}
```

#### 2. Fallback Strategy

When a relay is unreachable:
1. Log a warning with the specific relay address
2. Try next relay in the list (if any)
3. If all relays fail:
   - If `--relay-fault-tolerance=no-fatal`: continue without relay
   - Otherwise: fail with a clear error message suggesting `--disable-relay` or `--relay-fault-tolerance=no-fatal`

#### 3. Retry Logic

Consider implementing:
- Exponential backoff for relay reconnection attempts
- Background thread that periodically retries failed relays
- Dynamic relay list that updates based on reachability

#### 4. User Experience Improvements

- Clear error messages when relay is unreachable
- Suggestion to use `--disable-relay` or `--relay-fault-tolerance=no-fatal` in error output
- Status indicator for relay connectivity in debug output
- Consider adding `--warn-relay-unreachable` flag for non-fatal warnings

### Code Location

Changes would primarily be in:
- `rt/src/p2p/p2p.mts`: Main reachability check logic
- `rt/src/p2p/p2pconfig.mjs`: Relay configuration and fallback handling
- Potentially a new `rt/src/p2p/relayHealth.mts` module

### Testing Strategy

1. Unit tests for reachability check function
2. Integration tests with mock relay servers
3. Test scenarios:
   - All relays reachable
   - Some relays reachable
   - No relays reachable
   - Relay becomes unreachable after initial connection

### Security Considerations

- Reachability checks should timeout quickly to prevent DoS scenarios
- Don't expose detailed network errors that could leak infrastructure information
- Validate relay addresses before attempting connections

### Performance Impact

- Reachability checks add startup latency (mitigated by parallel checks)
- Consider caching reachability status for quick subsequent starts
- Background health checks should be lightweight

## Open Questions

1. Should we support a "relay pool" concept where multiple relays are tried in parallel?
2. How should we handle relays that are reachable but not accepting reservations?
3. Should relay health information be persisted across restarts?
4. What's the appropriate timeout for reachability checks?

## Related Issues

- Default relay server at `134.209.92.133:5555` appears to be frequently unavailable
- DNS resolution for `relay.troupe-lang.net` has stopped working (noted in p2pconfig.mjs)

## Priority

Medium - The current `--disable-relay` and `--relay-fault-tolerance` options provide adequate workarounds, but automatic graceful handling would improve user experience significantly.
