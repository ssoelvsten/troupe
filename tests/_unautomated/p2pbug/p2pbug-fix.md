# P2P Bug Fix: NO_RESERVATION Error Handling and Relay Reservations

## Problem Summary

Two related issues prevent Troupe nodes from communicating through a relay:

1. **NO_RESERVATION error causes stack trace**: When a node tries to connect to another node through a relay, and the target hasn't made a reservation, libp2p throws an `InvalidMessageError` with status `NO_RESERVATION`. This error is not handled gracefully, causing an unhandled exception and Node.js stack trace.

2. **Nodes don't make reservations**: In Circuit Relay V2 (unlike V1), peers must explicitly reserve a slot with the relay to be reachable through it. The current code only dials the relay but never establishes a reservation.

---

## Implementation Status: PARTIAL

Error handling (Part A) and reservation setup (Part B) have been implemented in `rt/src/p2p/p2p.mts`. However, testing has revealed a deeper issue with the STOP protocol handling.

### Current State After Testing

1. **Error handling works**: `NO_RESERVATION`, `CONNECTION_FAILED`, and protobuf errors are now caught gracefully (no crashes)
2. **Reservations are being made**: The relay confirms receiving RESERVE requests from both server and client
3. **Circuit connections fail**: When a client tries to connect through the relay, the STOP protocol to the server never completes

### Remaining Issue: STOP Protocol Not Completing

The test logs show:
- Relay receives CONNECT from client
- Relay starts STOP request to server
- STOP never completes (no "stop request successful" or "connection established" logs)
- Relay keeps receiving RESERVE refresh requests from the server (expected)
- Client gets `CONNECTION_FAILED` error

This appears to be a protocol-level issue where the Troupe node isn't properly handling the incoming STOP requests from the relay. The `circuitRelayTransport` should handle this automatically, but something is preventing the protocol from completing.

### Possible Causes to Investigate

1. Transport protocol mismatch between relay (WebSocket) and Troupe nodes (TCP)
2. Stream multiplexer incompatibility
3. Missing identify protocol exchange before STOP
4. Race condition between reservation and incoming connection handling

---

## Part A: Graceful Error Handling for NO_RESERVATION

### Goal
Treat `NO_RESERVATION` as a normal network condition (peer not reachable through relay), not an exceptional error. The system should gracefully handle this and allow retry mechanisms to work.

### Implementation (Lines 1050-1070)

Added new cases to `processExpectedNetworkErrors()`:

```typescript
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
case 'ConnectionFailedError':
case 'ERR_CONNECTION_FAILED':
  debug(`Connection failed: ${err.toString()}`);
  break;
```

---

## Part B: Implement Relay Reservations

### Goal
Make nodes listen on relay circuit addresses, which triggers the reservation protocol in Circuit Relay V2.

### Implementation Approach

**Key insight**: In js-libp2p, you cannot dynamically call `node.listen()` after the node is created. The `Libp2p` type doesn't expose a `listen()` method. Instead, the `/p2p-circuit` address must be included in the listen addresses at node creation time. The `circuitRelayTransport` then automatically makes a reservation when a relay is dialed.

This differs from the original plan which proposed calling `_node.listen()` dynamically in `dialRelay()`.

### Change 1: Add /p2p-circuit to Listen Addresses (Lines 230-237)

```typescript
async function createLibp2p(_options) {
  const relayOnly = argv[TroupeCliArg.RelayOnly] || false;
  const noP2pCircuit = argv[TroupeCliArg.NoP2pCircuit] || false;

  // Build listen addresses. Include /p2p-circuit to enable relay reservations
  // in Circuit Relay v2, unless --no-p2p-circuit is specified (for testing).
  const listenAddrs = [`/ip4/0.0.0.0/tcp/${__port}`];
  if (!noP2pCircuit) {
    listenAddrs.push('/p2p-circuit');
  } else {
    debug('--no-p2p-circuit: Relay reservations disabled (for testing NO_RESERVATION handling)');
  }

  const defaults: any = {
    addresses: {
      listen: listenAddrs
    },
    // ...
  };
}
```

### Change 2: Log Relay Addresses After Dialing (Lines 716-726)

Updated `dialRelay()` to log circuit addresses after connecting:

```typescript
// In circuit relay v2, the reservation is made automatically when we dial the relay
// because we have /p2p-circuit in our listen addresses (configured in createLibp2p).
// The circuitRelayTransport handles the HOP RESERVE protocol internally.
// Log the relay circuit addresses we're now reachable at.
const relayAddrs = _node.getMultiaddrs().filter(m => m.toString().includes('p2p-circuit'));
if (relayAddrs.length > 0) {
  debug(`Relay reservation established - now reachable through relay ${id}`);
  relayAddrs.forEach(addr => debug(`Relay address: ${addr.toString()}`));
} else {
  debug(`Relay dialed but no circuit addresses yet - reservation may be pending`);
}
```

### Reservation Refresh (NOT NEEDED - Built-in)

The js-libp2p `circuitRelayTransport` automatically handles reservation refresh:
- Internally tracks reservation expiration via `ReservationStore`
- Sets timeouts to refresh ~10 minutes before expiry
- Calls `addRelay()` again automatically

No manual refresh code needed!

---

## Part C: Testing CLI Option

### New Option: --no-p2p-circuit

Added to `rt/src/TroupeCliArgs.mts`:

```typescript
NoP2pCircuit = 'no-p2p-circuit',
```

This option disables the `/p2p-circuit` listen address, allowing you to test the NO_RESERVATION error handling in isolation. When a node runs with `--no-p2p-circuit`, it will not make a reservation with the relay, so other nodes trying to reach it through the relay will get `NO_RESERVATION` errors.

---

## Testing Plan

### Test 1: Verify NO_RESERVATION is Handled Gracefully

1. Start relay
2. Start server WITH `--no-p2p-circuit` flag (prevents reservation)
3. Start client and call `whereis("@server", "service")`
4. **Expected**: Debug log shows "Relay reservation not found", no stack trace, graceful timeout or retry

### Test 2: Verify Reservations Work

1. Start relay
2. Start server (normal mode, with reservation)
3. Verify server log shows "Relay reservation established"
4. Start client
5. Call `whereis("@server", "service")`
6. **Expected**: Server is found through relay

### Test 3: Verify Existing Functionality

1. Run existing multinode tests to ensure no regression
2. Run `./local.sh` tests to ensure non-P2P functionality unaffected

---

## Files Modified

| File                        | Changes                                                                                                          |
|-----------------------------|------------------------------------------------------------------------------------------------------------------|
| `rt/src/p2p/p2p.mts`        | Add error cases to `processExpectedNetworkErrors()`, add /p2p-circuit to listen addresses, log relay addresses  |
| `rt/src/TroupeCliArgs.mts`  | Add `--no-p2p-circuit` option                                                                                    |

---

## Error Codes Reference

From libp2p Circuit Relay V2 spec, status codes that can appear in HOP responses:

| Status                    | Meaning                                    |
|---------------------------|--------------------------------------------|
| `OK`                      | Success                                    |
| `RESERVATION_REFUSED`     | Relay refused to make reservation          |
| `RESOURCE_LIMIT_EXCEEDED` | Relay has too many reservations            |
| `PERMISSION_DENIED`       | Relay denied permission                    |
| `CONNECTION_FAILED`       | Relay couldn't connect to target           |
| `NO_RESERVATION`          | Target peer has no reservation with relay  |
| `MALFORMED_MESSAGE`       | Invalid message format                     |
| `UNEXPECTED_MESSAGE`      | Wrong message type                         |

All of these are now treated as recoverable network conditions, not fatal errors.

---

## Summary of Changes

1. **Error Handling** (Part A): Added `InvalidMessageError` with `NO_RESERVATION` (and related statuses) to the known error cases in `processExpectedNetworkErrors()`. These now log at debug level and don't throw.

2. **Relay Reservation** (Part B): Added `/p2p-circuit` to listen addresses in `createLibp2p()`. This makes the `circuitRelayTransport` automatically establish a reservation when dialing a relay.

3. **Testing Support** (Part C): Added `--no-p2p-circuit` CLI option to disable reservations for testing the error handling in isolation.

---

## Known Issues (See p2pbug-2.md)

The following issues were discovered during testing and require further investigation:

1. **STOP Protocol Failure**: Circuit relay connections fail because the STOP protocol doesn't complete. The relay receives CONNECT and starts STOP, but it never succeeds.

2. **Missing Circuit Address Advertisement**: Nodes don't advertise their `/p2p-circuit` addresses even after successful reservation.

3. **Protobuf Decoding Errors**: "invalid wire type 4" errors occur during HopMessage decoding. This was previously suppressed but is now properly thrown to enable debugging.
