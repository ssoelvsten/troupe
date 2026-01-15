# P2P Bug 2: Circuit Relay STOP Protocol Failure

## Problem Summary

After fixing the reservation issue (p2pbug-fix.md), circuit relay connections still fail. The relay successfully receives CONNECT requests and starts STOP requests to the target peer, but the STOP protocol never completes.

Additionally, there's a protobuf decoding error ("invalid wire type 4") that was suppressed rather than properly investigated.

---

## Issue 1: STOP Protocol Not Completing

### Symptoms

1. Both server and client successfully make reservations with the relay
2. Client sends CONNECT request to relay
3. Relay starts STOP request to server
4. STOP request never completes - no "stop request successful" log
5. Client receives `CONNECTION_FAILED` status

### Relay Log Evidence

```
hop connect request from [client]
starting circuit relay v2 stop request to [server]
received circuit v2 hop protocol stream from [server]   <-- Server sends RESERVE refresh
received RESERVE
...
(no "stop request successful" or "connection established" logs)
```

The relay keeps receiving RESERVE refreshes from the server, but the STOP never completes.

### Root Cause Investigation

The STOP protocol in Circuit Relay V2 works as follows:
1. Relay opens a new stream to the target peer using `/libp2p/circuit/relay/0.2.0/stop`
2. Target peer's `circuitRelayTransport` should handle this stream
3. Target peer responds, and the relay merges the streams

Possible causes:
1. **Transport mismatch**: Relay uses WebSocket (`/ws`), Troupe nodes use TCP. The relay connects to nodes via WebSocket, but Troupe nodes may not be listening on WebSocket for the STOP protocol.
2. **Protocol handler not registered**: The `circuitRelayTransport` may not be properly registering the STOP protocol handler.
3. **Identify protocol timing**: The STOP protocol may require identify exchange first.
4. **Connection reuse issue**: The relay may be trying to use a connection that's not suitable for the STOP protocol.

### Reproduction Steps

```bash
cd tests/_unautomated/p2pbug
bash run.sh
```

Look for in relay.log:
- "starting circuit relay v2 stop request" WITHOUT subsequent "stop request successful"

Look for in server.log:
- No incoming connection logs from the relay for STOP

---

## Issue 2: Protobuf Decoding Error

### Symptoms

```
Error: invalid wire type 4 at offset 18
    at Uint8ArrayReader.skipType (.../protons-runtime/dist/src/utils/reader.js:198:23)
    at Object.decode (.../circuit-relay-v2/dist/src/pb/index.js:85:36)
    ...
    at async CircuitRelayTransport.dial (...)
```

This error occurs during `HopMessage.decode()` when parsing a response from the relay.

### Current "Fix" (Inadequate)

The current code suppresses this error:
```typescript
case 'Error':
  if (err.message && err.message.includes('invalid wire type')) {
    debug(`Protobuf decode error (will retry): ${err.toString()}`);
  }
```

This is a band-aid that hides the problem rather than fixing it.

### Root Cause Investigation

"Invalid wire type 4" in protobuf means:
- Wire type 4 doesn't exist in protobuf (valid types are 0-5)
- The decoder is reading data that isn't a valid protobuf message
- This usually indicates reading the wrong data or a protocol mismatch

Possible causes:
1. **Reading non-protobuf data**: The client may be reading data from a different protocol/stream
2. **Stream multiplexing issue**: yamux/mplex may be delivering data from the wrong stream
3. **Protocol version mismatch**: Different versions of the circuit relay protocol
4. **Partial message**: Reading before the full message is available

### Current Status

The ad-hoc suppression of this error has been REMOVED. The error now throws as it should, allowing proper debugging. See `rt/src/p2p/p2p.mts` line ~1090.

### How to Investigate

1. **Add hex dump of received bytes before decoding**:

   Patch `node_modules/@libp2p/circuit-relay-v2/dist/src/transport/index.js`:
   ```javascript
   // Before the HopMessage.decode() call, add:
   console.log('HOP response bytes:', Buffer.from(data).toString('hex'));
   ```

2. **Decode the hex manually**:

   Use a protobuf decoder to see what the bytes actually contain. Wire type 4 doesn't exist, so we're likely reading:
   - Data from a different protocol
   - Partial/corrupted data
   - Framing bytes that shouldn't be included

3. **Check stream protocol ID**:

   Log `stream.protocol` before reading to confirm we're on the right protocol.

4. **Compare with working example**:

   Run the js-libp2p circuit relay example and capture the bytes for comparison:
   ```bash
   git clone https://github.com/libp2p/js-libp2p-example-circuit-relay
   cd js-libp2p-example-circuit-relay
   # Add logging to capture bytes
   ```

5. **Check length-prefix framing**:

   The circuit relay uses length-prefixed messages. If the length prefix is being included in the protobuf decode, this would cause the error.

---

## Test Setup for Reliable Reproduction

### Prerequisites

```bash
# Ensure runtime is built
cd /path/to/Troupe
make rt

# Ensure relay is built
cd p2p-tools/relay
make
```

### Test Configuration

The test uses `--relay-only` mode which disables DHT and mDNS, forcing all peer discovery through the relay. This isolates the circuit relay behavior.

Key files:
- `run.sh` - Main test script
- `server.trp` - Server that registers a service and waits
- `client.trp` - Client that does `whereis()` to find server
- `config.json` - Node identities
- `aliases.json` - Maps `@server` alias to server's peer ID

### Running the Test

```bash
cd tests/_unautomated/p2pbug
bash run.sh
```

### Expected vs Actual Behavior

**Expected**:
1. Relay starts
2. Server connects to relay, makes reservation, registers "echo" service
3. Client connects to relay, makes reservation
4. Client does `whereis("@server", "echo")`
5. Client dials server through relay circuit
6. Server receives WHEREIS, responds
7. Client gets server's PID

**Actual**:
1-4 work correctly
5. Client's dial through relay fails:
   - Sometimes with protobuf error
   - Sometimes with `CONNECTION_FAILED` status
6-7 never happen

### Debugging Options

Add these flags to `run.sh` for more detail:

```bash
# Already added:
--debugp2p              # Troupe P2P debug logging

# Can also add to relay start:
DEBUG=libp2p:*          # All libp2p debug output
DEBUG=libp2p:circuit-relay:*  # Circuit relay specific
```

---

## Files to Investigate

| File | Purpose |
|------|---------|
| `rt/src/p2p/p2p.mts` | Troupe's libp2p configuration |
| `p2p-tools/relay/relay.mts` | Relay server implementation |
| `node_modules/@libp2p/circuit-relay-v2/dist/src/transport/index.js` | Circuit relay transport |
| `node_modules/@libp2p/circuit-relay-v2/dist/src/pb/index.js` | Protobuf message definitions |

---

## Key Finding: Missing Circuit Address Advertisement

Looking at the server log:
```
Advertising with following addresses:
/ip4/127.0.0.1/tcp/16789/p2p/...
/ip4/10.192.104.4/tcp/16789/p2p/...
```

The server does NOT advertise its `/p2p-circuit` address! Even though:
1. The server has `/p2p-circuit` in its listen addresses
2. The relay confirms the RESERVE was successful

The `self:peer:update` event fires but only shows TCP addresses, not the circuit relay address. This means either:
1. The reservation isn't being properly processed by `circuitRelayTransport`
2. There's a timing issue where we check addresses before the reservation completes
3. The transport isn't adding the circuit address to the advertised addresses

---

## Hypotheses to Test

### Hypothesis 1: Reservation Not Completing on Client Side

The relay says "sent confirmation response" but the Troupe node may not be properly receiving/processing it.

The `circuitRelayTransport` should:
1. Send RESERVE request
2. Receive OK response with relay addresses
3. Add circuit address to node's multiaddrs

**Test**: Add logging inside `circuitRelayTransport` to see if the response is received.

### Hypothesis 2: Transport Protocol Mismatch (Less Likely)

The relay listens on WebSocket only:
```
/ip4/127.0.0.1/tcp/15555/ws/p2p/...
```

Troupe nodes listen on TCP:
```
/ip4/0.0.0.0/tcp/16789
```

When the relay tries to send STOP to the server, it may need to use TCP but only has a WebSocket connection.

**Test**: Add WebSocket listen address to Troupe nodes, or add TCP to relay.

### Hypothesis 3: Missing Identify Exchange

The STOP protocol may require the target peer to be identified first. Check if identify is exchanged before the STOP request.

**Test**: Add logging around identify events on the server.

### Hypothesis 3: Stream Protocol Mismatch

The protobuf error suggests receiving wrong data. The stream may be for a different protocol.

**Test**: Log the protocol ID of streams when data is received.

### Hypothesis 4: Connection Not Suitable for STOP

The relay may be trying to reuse a connection that was established for a different purpose.

**Test**: Check if the relay opens a new stream on the existing connection or tries to use an existing stream.

---

## Next Steps

1. [ ] Add hex dump logging before protobuf decode to see actual bytes
2. [ ] Add logging for STOP protocol handler registration on Troupe nodes
3. [ ] Test with WebSocket transport enabled on Troupe nodes
4. [ ] Compare libp2p configuration with working js-libp2p relay examples
5. [ ] Check if there's a version compatibility issue between relay and Troupe's libp2p dependencies

---

## Related Files

- [p2pbug-fix.md](p2pbug-fix.md) - Original fix for NO_RESERVATION error handling
- [README.md](README.md) - Overview of the P2P bug reproduction setup
