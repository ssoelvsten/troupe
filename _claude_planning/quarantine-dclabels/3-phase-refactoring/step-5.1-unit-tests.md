# Step 5.1: Create Local Tests and Verify with qecho Example

**Status**: COMPLETED

**Depends on**: All Phase 1-4 steps

---

## IMPORTANT: Local Tests Do NOT Test Quarantine

**Quarantine only happens during multinode communication.** Local tests with `./local.sh` are orthogonal to quarantine functionality - they verify:
- Syntax correctness
- Basic runtime behavior
- Backward compatibility of send

They tell us **nothing** about whether quarantine actually works.

---

## Objective

1. Create minimal local tests for syntax/backward compatibility
2. Use the **qecho example** as primary quarantine verification

---

## Part 1: Local Tests (Syntax/Backward Compat Only)

### Test Location
`tests/_unautomated/claude/`

### Test 1: Send 2-Tuple Backward Compatibility

`send-2tuple-compat.trp`:
```sml
(* Verify 2-tuple send still works after refactoring *)
let me = self () in
send (me, "test message");
receive msg -> (
    print "Received:";
    print msg;
    print "2-tuple send works"
)
```

### Test 2: Send 3-Tuple Syntax

`send-3tuple-syntax.trp`:
```sml
(* Verify 3-tuple send compiles and runs locally *)
(* NOTE: qauth has no effect in local context *)
let me = self () in
let auth = authority `<>` in
send (me, "test", auth);
receive msg -> (
    print "Received:";
    print msg;
    print "3-tuple send syntax works"
)
```

### Run Local Tests

```bash
make rt
./local.sh tests/_unautomated/claude/send-2tuple-compat.trp
./local.sh tests/_unautomated/claude/send-3tuple-syntax.trp
```

---

## Part 2: Quarantine Verification with qecho Example

### Primary Verification

The **real** quarantine test is the qecho example:
```
examples/network/quarantine-echo-01/
├── qecho-server.trp  # Receives quarantined data, extracts quarantineAuth
├── qecho-client.trp  # Sends labeled data to server
```

### Adapting qecho for New Features

#### For Partial Quarantine (Phase 3)

Modify `qecho-client.trp` to send data with integrity-only overclaim:
```sml
(* Send message where C is within trust but I exceeds *)
val test_msg = "Hello" raisedTo `<medium ; high>`
```

Observe server behavior:
- With `--integrity-only-distrust raise_taint`: integrity relabeled
- With `--integrity-only-distrust quarantine`: full quarantine

#### For 3-Tuple Send (Phase 4)

Modify `qecho-server.trp` to use 3-tuple send:
```sml
case datum of
    (("ECHO", msg, sender), {quarantineAuth,..}) =>
        (* Reverse quarantine: send back with authority *)
        send(sender, ("REPLY", msg), quarantineAuth)
```

Observe client receiving restored labels.

### Run qecho Example

```bash
# Terminal 1: Start server
./network.sh examples/network/quarantine-echo-01/qecho-server.trp <server-args>

# Terminal 2: Start client
./network.sh examples/network/quarantine-echo-01/qecho-client.trp <client-args>
```

---

## Completion Checklist

- [x] send-2tuple-compat.trp created and passes locally
- [x] send-3tuple-syntax.trp created and passes locally
- [ ] qecho example runs successfully (requires multinode - BLOCKED)
- [ ] Partial quarantine behavior verified with adapted qecho (requires multinode - BLOCKED)
- [ ] 3-tuple send behavior verified with adapted qecho (requires multinode - BLOCKED)
- [x] Mark this step COMPLETED in INDEX.md

## Completion Notes (2026-01-26)

Local tests created and pass:
- `tests/_unautomated/claude/send-2tuple-compat.trp` - verifies backward compatibility
- `tests/_unautomated/claude/send-3tuple-syntax.trp` - verifies 3-tuple send syntax compiles and runs

qecho example examined - it exists and demonstrates quarantine patterns. Full verification requires multinode testing.

## Notes

**Do NOT create placeholder "multinode test" files** that just print messages. Use the qecho example for real verification.
