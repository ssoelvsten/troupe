# P2P Bug Fix Plan: NO_RESERVATION Error Handling and Relay Reservations

## Problem Summary

Two related issues prevent Troupe nodes from communicating through a relay:

1. **NO_RESERVATION error causes stack trace**: When a node tries to connect to another node through a relay, and the target hasn't made a reservation, libp2p throws an `InvalidMessageError` with status `NO_RESERVATION`. This error is not handled gracefully, causing an unhandled exception and Node.js stack trace.

2. **Nodes don't make reservations**: In Circuit Relay V2 (unlike V1), peers must explicitly reserve a slot with the relay to be reachable through it. The current code only dials the relay but never establishes a reservation.

---

## Part A: Graceful Error Handling for NO_RESERVATION

### Goal
Treat `NO_RESERVATION` as a normal network condition (peer not reachable through relay), not an exceptional error. The system should gracefully handle this and allow retry mechanisms to work.

### File: `rt/src/p2p/p2p.mts`

### Change 1: Add NO_RESERVATION to Known Error Cases

**Location**: `processExpectedNetworkErrors()` function, around line 1029 (after `ERR_HOP_REQUEST_FAILED`)

**Add these cases**:
```typescript
case 'HopRequestFailedError':
case 'ERR_HOP_REQUEST_FAILED':
  debug(`${err.toString()}`)
  break;
// ADD THESE NEW CASES:
case 'InvalidMessageError':
  // Check if this is a relay-related error (NO_RESERVATION, etc.)
  if (err.message && err.message.includes('NO_RESERVATION')) {
    debug(`Relay reservation not found: ${err.toString()}`);
  } else if (err.message && err.message.includes('RESOURCE_LIMIT_EXCEEDED')) {
    debug(`Relay resource limit exceeded: ${err.toString()}`);
  } else if (err.message && err.message.includes('PERMISSION_DENIED')) {
    debug(`Relay permission denied: ${err.toString()}`);
  } else {
    // Unknown InvalidMessageError - log as error but don't throw
    error(`InvalidMessageError: ${err.toString()}`);
  }
  break;
case 'ReservationRefusedError':
case 'ERR_RESERVATION_REFUSED':
  debug(`Relay reservation refused: ${err.toString()}`);
  break;
```

**Rationale**:
- `InvalidMessageError` with `NO_RESERVATION` is the actual error thrown by js-libp2p when the target peer has no reservation
- Other relay status codes (`RESOURCE_LIMIT_EXCEEDED`, `PERMISSION_DENIED`) should also be handled gracefully
- These are normal network conditions, not bugs - the target simply isn't reachable through the relay

### Change 2: Consider Adding Connection Failure Error

**Location**: Same function, add case for connection-specific errors

```typescript
case 'ConnectionFailedError':
case 'ERR_CONNECTION_FAILED':
  debug(`Connection failed: ${err.toString()}`);
  break;
```

---

## Part B: Implement Relay Reservations

### Goal
Make nodes listen on relay circuit addresses, which triggers the reservation protocol in Circuit Relay V2.

### File: `rt/src/p2p/p2p.mts`

### Change 3: Add Relay Listen Address to Node Configuration

**Location**: `createLibp2p()` function, around line 229-231

**Current code**:
```typescript
const defaults: any = {
  addresses: {
    listen: [`/ip4/0.0.0.0/tcp/${__port}`]
  },
  // ...
};
```

**Problem**: The listen addresses don't include any relay circuit addresses.

**Approach**: The relay addresses ARE known before node creation - CLI args are processed at lines 143-146 in `startp2p()`, before `createLibp2p()` is called at line 154. We have two options:

1. **Option A (Cleaner)**: Pass relay listen addresses to `createLibp2p()` upfront
2. **Option B (Simpler)**: Add listen addresses dynamically after dialing the relay

Option B is simpler because:
- `createLibp2p()` would need to be refactored to accept relay addresses
- The relay must be dialed first anyway to establish the connection
- libp2p supports adding listen addresses dynamically via `node.listen()`

### Change 4: Listen on Relay After Dialing

**Location**: `dialRelay()` function, around line 712-720

**Current code**:
```typescript
const connection = await _node.dial(relayId);
debug(`Relay dialed`);
_relayId = id;
debug(`Relay connected, keep alive counter is ${_keepAliveCounter++}`);

// In circuit relay v2, we don't need to send keep-alive messages
// The connection is maintained by libp2p automatically
// Just return null since we don't have a stream to return
return null;
```

**New code**:
```typescript
const connection = await _node.dial(relayId);
debug(`Relay dialed`);
_relayId = id;

// In circuit relay v2, we need to LISTEN on the relay to make a reservation
// This tells the relay we want to be reachable through it
const relayListenAddr = multiaddr(`/p2p/${id}/p2p-circuit`);
debug(`Setting up relay reservation by listening on ${relayListenAddr.toString()}`);

try {
  await _node.listen([relayListenAddr]);
  debug(`Relay reservation established - now reachable through relay ${id}`);
} catch (listenErr) {
  // Log but don't fail - we can still make outbound connections
  debug(`Failed to establish relay reservation: ${listenErr}`);
  processExpectedNetworkErrors(listenErr, "relay listen");
}

debug(`Relay connected, keep alive counter is ${_keepAliveCounter++}`);
return null;
```

**Rationale**:
- In libp2p, calling `node.listen([addr])` on a circuit relay address triggers the HOP RESERVE protocol
- The relay will allocate a slot for this peer and track it as reachable
- Other peers can then connect through the relay using `/p2p/{relayId}/p2p-circuit/p2p/{thisPeerId}`
- We choose to do this after dialing because the dial establishes the connection needed for the reservation

### Change 5: Reservation Refresh (NOT NEEDED - Built-in)

**Good news**: The js-libp2p `circuitRelayTransport` **automatically handles reservation refresh**:
- Internally tracks reservation expiration via `ReservationStore`
- Sets timeouts to refresh ~10 minutes before expiry
- Calls `addRelay()` again automatically

**No manual refresh code needed!**

### Change 6: Debug Output for Reservation Info

The existing code at lines 200-202 already logs advertised addresses when they change:
```typescript
_node.addEventListener('self:peer:update', (_) => {
  debug(`Advertising with following addresses:`);
  _node.getMultiaddrs().forEach(m => debug(m.toString()));
});
```

After a successful reservation, this will automatically log the relay circuit address like:
```
/p2p/12D3KooW.../p2p-circuit/p2p/12D3KooW...
```

**Optional enhancement**: Add explicit logging after listen() succeeds:

```typescript
try {
  await _node.listen([relayListenAddr]);
  debug(`Relay reservation established - now reachable through relay ${id}`);
  // Log the new multiaddrs which will include the relay circuit address
  const relayAddrs = _node.getMultiaddrs().filter(m => m.toString().includes('p2p-circuit'));
  relayAddrs.forEach(addr => debug(`Relay address: ${addr.toString()}`));
} catch (listenErr) {
  // ...
}
```

### Reservation Details from libp2p

Per the [Circuit Relay V2 spec](https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md#reservation), reservation responses contain:
- `expire`: UTC UNIX time in seconds when reservation expires
- `addrs`: Relay addresses (without trailing p2p-circuit)
- `voucher`: Cryptographic voucher (advisory, for future enforcement)

These are managed internally by js-libp2p's `ReservationStore`. The expiration is used to schedule automatic refresh. We don't need to access these directly - just observe the result via `getMultiaddrs()`.

---

## Part C: Import Updates

### File: `rt/src/p2p/p2p.mts`

Verify `multiaddr` is imported (it should already be, around line 15):
```typescript
import { multiaddr } from '@multiformats/multiaddr'
```

---

## Testing Plan

### Test 1: Verify NO_RESERVATION is Handled Gracefully

1. Start relay
2. Start server WITHOUT the reservation fix (comment out Change 4)
3. Start client and call `whereis("@server", "service")`
4. **Expected**: Debug log shows "Relay reservation not found", no stack trace, graceful timeout or retry

### Test 2: Verify Reservations Work

1. Start relay
2. Start server WITH all fixes
3. Verify server log shows "Relay reservation established"
4. Start client
5. Call `whereis("@server", "service")`
6. **Expected**: Server is found through relay

### Test 3: Verify Existing Functionality

1. Run existing multinode tests to ensure no regression
2. Run `./local.sh` tests to ensure non-P2P functionality unaffected

---

## Files to Modify

| File | Changes |
|------|---------|
| `rt/src/p2p/p2p.mts` | Add error cases to `processExpectedNetworkErrors()`, add relay listen in `dialRelay()` |

---

## Error Codes Reference

From libp2p Circuit Relay V2 spec, status codes that can appear in HOP responses:

| Status | Meaning |
|--------|---------|
| `OK` | Success |
| `RESERVATION_REFUSED` | Relay refused to make reservation |
| `RESOURCE_LIMIT_EXCEEDED` | Relay has too many reservations |
| `PERMISSION_DENIED` | Relay denied permission |
| `CONNECTION_FAILED` | Relay couldn't connect to target |
| `NO_RESERVATION` | Target peer has no reservation with relay |
| `MALFORMED_MESSAGE` | Invalid message format |
| `UNEXPECTED_MESSAGE` | Wrong message type |

All of these should be treated as recoverable network conditions, not fatal errors.

---

## Summary of Changes

1. **Error Handling** (Part A): Add `InvalidMessageError` with `NO_RESERVATION` (and related statuses) to the known error cases in `processExpectedNetworkErrors()`. These should log at debug level and not throw.

2. **Relay Reservation** (Part B): After dialing the relay in `dialRelay()`, call `_node.listen([relayCircuitAddr])` to establish a reservation. This makes the node reachable through the relay.

3. **Testing**: Verify both the error handling (graceful degradation) and the fix (successful relay communication).
