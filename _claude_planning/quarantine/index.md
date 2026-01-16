This document contains an overview of all the steps we need to implement quarantines.

## Plan

1. **Create a basic example skeleton** [DONE]
   - Location: `examples/network/quarantine-echo-01/`
   - Two nodes: client and server
   - Asymmetric trust: client trusts server at `{alice}`, server doesn't trust client
   - Uses static trustmap approach (recommended for simplicity)
   - Demonstrates trust-based level downgrading on receive

2. **Check existing metadata access for messages in runtime** [DONE]
   - See detailed findings below in "Step 2 Details"

3. **Extend runtime and frontend for record-based metadata approach** [DONE]
   - ✅ Message metadata now uses record `{senderNode=nodeId}` instead of plain `nodeId`
   - ✅ Quarantine authority field added to metadata (`quarantineAuth`)
   - ✅ Ingress quarantine check implemented (commit `b99f4cc`)
   - See "Step 3 Details" below

4. **Revisit the example**
   - Update quarantine-echo-01 to use new metadata support
   - Demonstrate quarantine protocol in action

5. **Expand example for gate call idiom**
   - Support gate call idiom from HiStar and Zagibeylo's papers
   - Create extended example demonstrating gate calls

---

## Step 2 Details: Message Metadata Investigation

### Current Message Structure (After Step 3)

Messages are tuples `(payload, metadata)` where metadata is now a record:

```typescript
// rt/src/MailboxProcessor.mts:25-30
function createMessage(msg, fromNodeId, pc) {
    let metadata = Record.mkRecord([["senderNode", fromNodeId]]);
    let tuple = mkTuple([msg, new LVal(metadata, fromNodeId.lev)]);
    return new MbVal(tuple, pc);
}
```

### Metadata Available to Handlers

| Field          | Type      | Description                                              |
|----------------|-----------|----------------------------------------------------------|
| senderNode     | string    | Node ID of the sender (e.g., peer ID or `"<local>"`)     |
| quarantineAuth | Authority | Fresh authority for downgrading quarantined messages (present only if message was quarantined) |

### How to Access Metadata in Handlers

The compiler already supports `hn pat1 | pat2 => body` syntax (Parser.y:183):

```troupe
(* Basic handler - metadata ignored (wildcard) *)
receive [hn ("ECHO", msg) => ...]

(* Handler with metadata access *)
receive [hn ("ECHO", msg) | {senderNode=sender} =>
    print ("From: " ^ sender)
]

(* Handler with metadata and guard *)
receive [hn ("ECHO", msg) | {senderNode=s} when s = expectedSender => ...]
```

### Key Files

| File                              | Purpose                                      |
|-----------------------------------|----------------------------------------------|
| rt/src/MailboxProcessor.mts       | Message creation with metadata record        |
| rt/src/runtimeMonitored.mts:183-259 | Send/receive operations, trust level checks |
| rt/src/TrustManager.mts           | Trust level management                       |
| rt/src/Record.mts                 | Record type implementation                   |
| compiler/src/Parser.y:182-185     | Handler syntax `hn pat | meta => body`       |
| compiler/src/CaseElimination.hs   | Handler desugaring                           |
| trp-rt/service.trp                | High-level receive/rcv functions             |

---

## Step 3 Details: Record-Based Metadata Implementation

### What Was Implemented

1. **Modified `createMessage` in rt/src/MailboxProcessor.mts**:
   - Changed from `mkTuple([msg, fromNodeId])`
   - To `mkTuple([msg, new LVal(Record.mkRecord([["senderNode", fromNodeId]]), fromNodeId.lev)])`

2. **Backward Compatibility**:
   - Existing handlers using `hn pattern =>` (without `| meta`) continue to work
   - The metadata pattern defaults to wildcard in the compiler

### Tests Updated

Three golden files needed updates due to changed output format:
- `tests/rt/pos/core/consume01.golden`
- `tests/rt/pos/ifc/peek01.golden`
- `tests/rt/pos/ifc/peek02.golden`

These tests use low-level `peek`/`consume` primitives that expose the message structure.

---

## Next Steps: Implementing Full Quarantine Protocol

### PDF Reference

The quarantine protocol is specified in `_claude_planning/quarantine/Troupe_security_model_design-5.pdf`:
- **Section 4.1.2**: Ingress security mechanism and quarantining
- **Section 4.3.1**: Troupe quarantine protocol
- **Section 6.2**: Message metadata record specification

### Quarantine Protocol Summary (from PDF Section 4.1.2)

Upon receiving a message with value `v` labeled at `ℓ` from node `n` with trust level `ℓ_n`:

1. **If `ℓ` is not corrupt**, construct value at level `ℓ'`:
   - `ℓ' = ℓ` if `ℓ_n ⪰ ℓ` (node trusted enough for claimed label)
   - `ℓ' = q` where `q` is fresh quarantine label if `ℓ_n ⋡ ℓ` (overclaiming)

2. **If `ℓ'` is corrupt**, drop the message.

3. Place tuple `(ℓ_q, relabeled_data)` in mailbox where `ℓ_q` is fresh quarantine authority.

### Implementation Tasks for Full Quarantine [COMPLETED]

All tasks were implemented in commit `b99f4cc`. See [deserialization.md](deserialization.md) for details.

| Task | Description | Location |
|------|-------------|----------|
| 1 | `IngressResult` enum (TRUSTED/QUARANTINE/DROP) | deserialize.mts:22-26 |
| 2 | `IngressDeserializer` class with `checkLabel()` | deserialize.mts:261-350 |
| 3 | Exception handling for corrupt data | deserialize.mts:400-419 |
| 4 | `receiveFromRemote` handles three outcomes | runtimeMonitored.mts:203-228 |
| 5 | `quarantineAuth` in message metadata | MailboxProcessor.mts:26-37, 57-89 |

---

## Notes

### Trust Configuration Approaches

For this development, we chose the **static approach** for trust configuration:
- Trust relationships defined in JSON trustmap files
- Files loaded at node startup via `--trustmap` flag
- Simple, explicit, and easy to debug
- Format: `[{"id": "<peer-id>", "level": "<label>"}]`

Alternative (programmatic) approach would allow runtime trust negotiation but adds complexity.

### Example Location

The example skeleton is at `examples/network/quarantine-echo-01/` rather than in tests because:
- It's a development example, not an automated test
- Allows for interactive exploration and modification
- Can be converted to an automated test later once stable

### Handler Desugaring Reference

From `compiler/src/CaseElimination.hs:82-88`:

```
Given `hn pat1 | pat2 when e1 => e2`, we desugar it to

fn (input) =>
  case input of
      (pat1, pat2) => if e1 then (0, fn _ => e2)
                            else (1, ())
      _ => (1, ())
```
