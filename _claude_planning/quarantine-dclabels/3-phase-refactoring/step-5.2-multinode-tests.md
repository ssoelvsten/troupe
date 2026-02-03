# Step 5.2: Create Multinode Tests for Quarantine

**Status**: NOT STARTED (BLOCKED)

**Depends on**: Step 5.1

---

## BLOCKER: Distributed Tests Broken

**Distributed/multinode test infrastructure is currently broken.** This step cannot be fully executed until that is fixed.

**Recommended approach:**
1. Create the test files as documented below
2. Do NOT attempt to run them until infrastructure is fixed
3. Mark this step as BLOCKED in INDEX.md

---

## Objective

Create multinode tests to verify quarantine behavior across nodes with different trust levels.

## Test Location

Create new folder: `tests/rt/multinode-tests/quarantine-partial/`

## Setup

Follow instructions in `tests/rt/multinode-tests/README.md` and use scripts in `scripts/`.

## Tests to Create

### Test 1: Full Quarantine on Overclaim

**Scenario**: Node B sends message with labels exceeding Node A's trust on B

```
config.json:
{
  "nodes": {
    "nodeA": { "trust": { "nodeB": "<low ; low>" } },
    "nodeB": {}
  }
}

nodeA.trp:
(* Receive message from nodeB, expect quarantine *)
receive [msg, metadata] -> (
    print "Received message:";
    print msg;
    print "Metadata:";
    print metadata;
    case metadata of {
        {quarantineAuth = auth} -> print "Quarantine authority present"
      | _ -> print "No quarantine (unexpected)"
    }
)

nodeB.trp:
(* Send message with high labels to nodeA *)
let nodeA_pid = ... in
let msg = raisedTo `<high ; high>` "secret data" in
send (nodeA_pid, msg);
print "Sent message with high labels"
```

### Test 2: Integrity-Only Overclaim with RAISE_TAINT

**Scenario**: Node B sends message where C is within trust but I exceeds

```
Run nodeA with: --integrity-only-distrust raise_taint

config.json:
{
  "nodes": {
    "nodeA": { "trust": { "nodeB": "<medium ; medium>" } },
    "nodeB": {}
  }
}

nodeB.trp:
(* Send message: C within trust, I exceeds *)
let msg = raisedTo `<medium ; high>` "data" in
send (nodeA_pid, msg)

Expected: nodeA receives message with integrity raised to <medium>
```

### Test 3: Integrity-Only Overclaim with QUARANTINE

**Scenario**: Same as Test 2 but with QUARANTINE setting

```
Run nodeA with: --integrity-only-distrust quarantine (default)

Expected: nodeA receives quarantined message with authority
```

### Test 4: Reverse Quarantine with 3-Tuple Send

**Scenario**: nodeA receives quarantined message, sends back with qauth

```
nodeA.trp:
receive [msg, {quarantineAuth = auth}] -> (
    print "Received quarantined message";
    (* Send back using quarantine authority *)
    send (nodeB_pid, msg, auth);
    print "Sent back with qauth"
)

nodeB.trp:
(* Receive should succeed, labels restored *)
receive msg -> (
    print "Received restored message:";
    print msg
)
```

### Test 5: Forward to Wrong Node Fails

**Scenario**: nodeA tries to forward quarantined data to nodeC (not source)

```
Expected: Error or blocked send
```

## Verification

Follow multinode test execution process from README.

## Completion Checklist

- [ ] tests/rt/multinode-tests/quarantine-partial/ created
- [ ] config.json created
- [ ] Test scripts created
- [ ] **BLOCKED**: Full quarantine test passes (awaiting distributed test fix)
- [ ] **BLOCKED**: RAISE_TAINT test passes (awaiting distributed test fix)
- [ ] **BLOCKED**: QUARANTINE test passes (awaiting distributed test fix)
- [ ] **BLOCKED**: Reverse quarantine test passes (awaiting distributed test fix)
- [ ] **BLOCKED**: Forward-to-wrong-node test passes (awaiting distributed test fix)
- [ ] Mark this step BLOCKED in INDEX.md (change to COMPLETED when tests run)

## Notes

Multinode tests are more complex to set up and run. Consult existing multinode tests for patterns.

(Add any implementation notes here after completion)
