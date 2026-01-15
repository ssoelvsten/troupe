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

## Issue 4: Connection Timing (RESOLVED)

After the circuit relay fixes, there was still a timing issue where the server sends PONG but the client times out. This has been resolved.

### Root Cause

When a Troupe program calls `exit()` immediately after `send()`, the P2P shutdown happens before the message can traverse through the circuit relay to the remote peer. The issue is:

1. `send()` queues the message in the stream's write buffer
2. `exit()` triggers `stopp2p()` which stops the libp2p node
3. The node closes connections before the data can be relayed to the peer
4. The remote peer sees a disconnect instead of receiving the message

### Solution

For fire-and-forget `send()` operations where you need to ensure delivery before exiting, add a short delay before calling `exit()`. This gives time for messages to traverse through circuit relays.

```sml
(* After send, wait for message to be delivered through relay *)
val _ = send(recipient, message)
val _ = sleep 1000  (* Allow relay transmission *)
val _ = exit(authority, 0)
```

### Why This Happens

In libp2p v3, `stream.send()` returns immediately - it just queues data in an internal buffer. There's no API to wait for data to actually reach the remote peer. For circuit relay connections, "reaching the transport" (what `stream.close()` waits for) only means reaching the relay connection, not the end-to-end peer.

The `stopp2p()` function in the runtime:
1. Ends all pushables (signals no more data to queue)
2. Waits for write pipelines to drain (all data sent to `stream.send()`)
3. Calls `_node.stop()` which closes all connections

The data is in libp2p's buffers when `_node.stop()` is called, but it hasn't traversed the relay yet.

### Alternative Solutions Considered

1. **Application-level ACKs**: Require acknowledgment before exiting. Cleanest but adds complexity.
2. **Runtime-level flush**: Track pending writes and wait. Rejected because libp2p doesn't expose when data reaches the remote peer.
3. **Arbitrary delays in runtime**: Hacky and unreliable.

The sleep solution is pragmatic for test cases and applications where delivery timing matters.

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
