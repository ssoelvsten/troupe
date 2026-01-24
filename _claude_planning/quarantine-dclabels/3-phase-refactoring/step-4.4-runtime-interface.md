# Step 4.4: Wire Up RuntimeInterface

**Status**: NOT STARTED

**Depends on**: Steps 4.1, 4.2, 4.3

---

## Objective

Ensure all new methods are properly wired through the RuntimeInterface for access from builtins.

## Files to Modify

1. `rt/src/RuntimeInterface.mts` - Add interface definition
2. `rt/src/runtimeMonitored.mts` - Ensure implementation is exported

## Implementation

### 1. RuntimeInterface.mts

Add to the interface:

```typescript
export interface RuntimeInterface {
    // ... existing methods

    /**
     * Send message with optional quarantine authority for reverse quarantine.
     */
    sendMessageWithQuarantineAuth(
        lRecipientPid: LVal,
        message: LVal,
        quarantineAuth: Level | null
    ): any;
}
```

### 2. runtimeMonitored.mts

Ensure the implementation object includes:

```typescript
export const runtime: RuntimeInterface = {
    // ... existing implementations

    sendMessageWithQuarantineAuth: rt_sendMessageWithQuarantineAuth,
};
```

Or if using a different pattern, ensure the method is accessible via `$r.sendMessageWithQuarantineAuth`.

## Verification

**IMPORTANT**: Local tests do NOT exercise the 3-tuple send with quarantine authority. The qauth parameter is only meaningful in multinode context.

### Build Verification
```bash
make rt
```

### 2-Tuple Backward Compatibility (Local Test)
```bash
# Create a simple local test for 2-tuple
./local.sh tests/_unautomated/claude/send-2tuple-compat.trp
```

```sml
(* send-2tuple-compat.trp *)
let me = self () in
send (me, "hello");
receive _ -> print "2-tuple send works"
```

### 3-Tuple Send Verification with qecho Example

Modify `examples/network/quarantine-echo-01/qecho-server.trp` to use 3-tuple send:

```sml
(* In the ECHO handler, use 3-tuple send with quarantineAuth *)
case datum of
    (("ECHO", msg, sender), {quarantineAuth,..}) =>
        (* Use 3-tuple send to reply with quarantine authority *)
        send(sender, ("REPLY", msg), quarantineAuth)
```

**Expected behavior:**
- Server receives quarantined message with quarantineAuth
- Server uses 3-tuple send to reply with the authority
- Client should receive message with labels restored (reverse quarantine)

### Run the Example

```bash
# Terminal 1: Start server (with modified qecho-server.trp)
./network.sh examples/network/quarantine-echo-01/qecho-server.trp <server-args>

# Terminal 2: Start client
./network.sh examples/network/quarantine-echo-01/qecho-client.trp <client-args>
```

## Completion Checklist

- [ ] RuntimeInterface updated with sendMessageWithQuarantineAuth
- [ ] Implementation wired in runtimeMonitored.mts
- [ ] `make rt` succeeds
- [ ] 2-tuple send backward compatibility verified (local test)
- [ ] 3-tuple send verified with modified qecho example
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

(Add any implementation notes here after completion)
