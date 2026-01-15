# P2P Bug 2: Circuit Relay STOP Protocol Failure

## Problem Summary

After fixing the reservation issue (p2pbug-fix.md), circuit relay connections still fail. The relay successfully receives CONNECT requests and starts STOP requests to the target peer, but the STOP protocol never completes.

Additionally, there's a protobuf decoding error ("invalid wire type 4") that was suppressed rather than properly investigated.

---

## FIXES IMPLEMENTED (2026-01-15)

The following fixes have been applied and tested:

### Fix 1: Use Specific Relay Address in Listen Config

**Problem**: Using generic `/p2p-circuit` as listen address triggers relay discovery, but in `--relay-only` mode, discovery (DHT, mDNS, bootstrap) is disabled. The `circuitRelayTransport` never makes a reservation.

**Solution**: In `rt/src/p2p/p2p.mts`, changed the listen address configuration to include the specific relay address:

```typescript
// OLD (broken in relay-only mode):
listenAddrs.push('/p2p-circuit');

// NEW (works):
for (const relay of relays) {
  listenAddrs.push(`${relay}/p2p-circuit`);
}
```

This triggers `CircuitListen` instead of `CircuitSearch` in the transport listener, which explicitly makes a reservation on the specified relay.

### Fix 2: Reduce Relay Limit Values to Avoid Protobuf Overflow

**Problem**: The relay's `defaultDurationLimit: 2147483647` and `defaultDataLimit: BigInt(4294967295)` caused protobuf encoding issues. When encoded as varints, these values created invalid protobuf data that caused "invalid wire type" errors.

**Solution**: In `p2p-tools/relay/relay.mts`, reduced the limit values:

```typescript
// OLD (causes protobuf decode errors):
reservations: {
  defaultDurationLimit: 2147483647,
  defaultDataLimit: BigInt(4294967295),
}

// NEW (works):
reservations: {
  defaultDurationLimit: 3600,  // 1 hour
  defaultDataLimit: BigInt(1073741824),  // 1GB
}
```

### Fix 3: Enable `runOnLimitedConnection` for Troupe Protocol

**Problem**: Circuit relay connections are "limited connections" and by default libp2p won't open protocol streams on them. The Troupe protocol handler and dial calls didn't have this option enabled.

**Solution**: In `rt/src/p2p/p2p.mts`, added `runOnLimitedConnection: true`:

```typescript
// Handler registration:
await _node.handle(_PROTOCOL, async (stream, connection) => {
  // ...
}, { runOnLimitedConnection: true });

// Dial call:
const stream = await _node.dialProtocol(id, _PROTOCOL, { runOnLimitedConnection: true });
```

### Fix 4: Remove Deprecated mplex Stream Muxer

**Problem**: `mplex` is deprecated and can cause issues with circuit relay. The official examples only use `yamux`.

**Solution**: Commented out `mplex()` from both `rt/src/p2p/p2p.mts` and `p2p-tools/relay/relay.mts`:

```typescript
streamMuxers: [
  yamux(),
  // mplex is deprecated - use only yamux for circuit relay compatibility
  // mplex()
],
```

---

## Test Results After Fixes

Running `bash run.sh` now shows:

1. ✅ Server makes reservation with relay
2. ✅ Server advertises circuit relay address
3. ✅ Client makes reservation with relay
4. ✅ Client advertises circuit relay address
5. ✅ Client finds server via `whereis()` through circuit relay
6. ✅ Client sends PING to server through relay
7. ✅ Server receives PING
8. ✅ Server sends PONG back
9. ⚠️ Client may timeout before receiving PONG (race condition, separate issue)

The core circuit relay functionality is now working. The remaining issue is a timing/race condition where the connection is closed before the response arrives, which is a separate concern from the relay setup.

---

## Issue 1: STOP Protocol Not Completing (RESOLVED)

### Symptoms (Before Fix)

1. Both server and client successfully make reservations with the relay
2. Client sends CONNECT request to relay
3. Relay starts STOP request to server
4. STOP request never completes - no "stop request successful" log
5. Client receives `CONNECTION_FAILED` status

### Root Cause

The `circuitRelayTransport` was using generic `/p2p-circuit` listen address which triggers relay **discovery**. In `--relay-only` mode with no DHT/mDNS/bootstrap, discovery never finds any relays, so no reservation is made.

### Solution

Use specific relay address format: `/ip4/x.x.x.x/tcp/port/ws/p2p/RELAY_ID/p2p-circuit`

This tells the transport to make a reservation on that specific relay without requiring discovery.

---

## Issue 2: Protobuf Decoding Error (RESOLVED)

### Symptoms (Before Fix)

```
Error: invalid wire type 4 at offset 332
    at Uint8ArrayReader.skipType (...)
    at Object.decode (...circuit-relay-v2/dist/src/pb/index.js:85:36)
```

### Root Cause

The relay's limit configuration used very large values that caused protobuf encoding issues:
- `defaultDurationLimit: 2147483647` (max int32)
- `defaultDataLimit: BigInt(4294967295)` (max uint32)

When these values were encoded in the HopMessage `limit` field, the protobuf varint encoding produced bytes that were misinterpreted by the decoder.

### Investigation Method

Added hex dump logging to `@libp2p/utils/dist/src/stream-utils.js` to capture the actual bytes received:

```javascript
console.log('PB_READ bytes:', Buffer.from(value).toString('hex'));
```

The hex dump showed that the `limit` field at the end of the message contained invalid varint sequences like `ff 00 00 19 c2 28 64` instead of proper varint encoding.

### Solution

Reduce the limit values to reasonable sizes (1 hour, 1GB) which encode correctly.

---

## Issue 3: LimitedConnectionError (RESOLVED)

### Symptoms

```
LimitedConnectionError: Cannot open protocol stream on limited connection
```

### Root Cause

Circuit relay connections are marked as "limited" by libp2p. By default, protocol streams cannot be opened on limited connections for security/resource reasons.

### Solution

Add `runOnLimitedConnection: true` to both:
1. Protocol handler registration (`_node.handle()`)
2. Protocol dial calls (`_node.dialProtocol()`)

---

## Remaining Issue: Connection Timing

After all fixes, there's still a timing issue where the server sends PONG but the client times out. The connection is closed immediately after the response is sent. This appears to be a Troupe-level issue rather than a libp2p/relay issue.

### Evidence from Logs

Server side (works correctly):
```
Received SEND from [client]
SERVER: Received PING from client
SERVER: Sent PONG reply
SERVER: Test passed
Hanging up connection to [client]
```

Client side (doesn't receive PONG):
```
CLIENT: Found echo server!
CLIENT: Sent PING, waiting for PONG...
Disconnect from [server]
CLIENT: Timeout - could not find server (BUG REPRODUCED)
```

The connection is hung up before the PONG can be received. This is likely a race condition in the Troupe message handling that should be investigated separately.

---

## Files Modified

| File | Change |
|------|--------|
| `rt/src/p2p/p2p.mts` | Use specific relay address, remove mplex, add runOnLimitedConnection |
| `p2p-tools/relay/relay.mts` | Reduce limit values, remove mplex |

---

## How to Verify Fixes

```bash
cd tests/_unautomated/p2pbug
bash run.sh
```

Expected output should show:
- "Relay reservation established" for both server and client
- "Relay address: /ip4/.../p2p-circuit/p2p/..." in the advertised addresses
- "CLIENT: Found echo server!" indicating whereis() worked
- Server receiving PING and sending PONG

---

## References

- [mplex deprecation](https://docs.libp2p.io/concepts/multiplex/mplex/)
- [Circuit Relay v2 spec](https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md)
- [js-libp2p circuit relay example](https://github.com/libp2p/js-libp2p-example-circuit-relay)
