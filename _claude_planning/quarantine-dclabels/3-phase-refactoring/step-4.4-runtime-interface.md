# Step 4.4: Update RuntimeInterface

**Status**: NOT STARTED

**Depends on**: Steps 4.1, 4.2

---

## Objective

Update `RuntimeInterface.mts` to add optional `qauth` parameter to existing `sendMessageNoChecks`.

**Note**: No separate `sendMessageWithQuarantineAuth` - just modify existing method signature.

## File to Modify

`rt/src/RuntimeInterface.mts`

## Implementation

Modify existing signature:

```typescript
import { Authority } from './Authority.mjs';

export interface RuntimeInterface {
    // ... existing methods

    sendMessageNoChecks(
        toPid: any,
        message: LVal,
        qauth?: Authority,
        ret?: boolean
    ): any;
}
```

**Note**: Uses `Authority` type, not `Level | null`.

## Verification

### Build
```bash
make rt
```

### 2-Tuple Backward Compatibility

```sml
(* tests/_unautomated/claude/send-2tuple-compat.trp *)
let me = self () in
send (me, "hello");
receive _ -> print "2-tuple send works"
```

```bash
./local.sh tests/_unautomated/claude/send-2tuple-compat.trp
```

### 3-Tuple with qecho Example

Modify `examples/network/quarantine-echo-01/qecho-server.trp`:

```sml
case datum of
    (("ECHO", msg, sender), {quarantineAuth,..}) =>
        send(sender, ("REPLY", msg), quarantineAuth)
```

Run:
```bash
# Terminal 1: Server
./network.sh examples/network/quarantine-echo-01/qecho-server.trp <args>

# Terminal 2: Client
./network.sh examples/network/quarantine-echo-01/qecho-client.trp <args>
```

### Verify 2-arg Send Fails for Quarantined

Create test that receives quarantined data and tries 2-arg send - should fail with "Illegal trust flow" error.

## Completion Checklist

- [ ] RuntimeInterface updated with optional qauth parameter
- [ ] `make rt` succeeds
- [ ] 2-tuple send backward compatibility verified
- [ ] 3-tuple send verified with qecho example
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

- No separate `sendMessageWithQuarantineAuth` method - just optional parameter on existing method
- Type is `Authority` not `Level | null`
