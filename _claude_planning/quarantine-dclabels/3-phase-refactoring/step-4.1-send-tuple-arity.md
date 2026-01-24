# Step 4.1: Extend send.mts for 2/3-Tuple

**Status**: NOT STARTED

---

## Objective

Modify the `send` builtin to accept either a 2-tuple `(pid, message)` or a 3-tuple `(pid, message, qauth)`.

## File to Modify

`rt/src/builtins/send.mts`

## Current Implementation

```typescript
send = mkBase((larg) => {
    // ...
    assertIsNTuple(larg, 2);  // Only accepts 2-tuple
    assertIsProcessId(larg.val[0]);
    let arg = larg.val;
    let lRecipientPid = arg[0];
    let message = arg[1];
    return $r.sendMessageNoChecks(lRecipientPid, message)
}, "send");
```

## New Implementation

```typescript
import { assertIsAuthority } from './Asserts.mjs';

send = mkBase((larg) => {
    let $r = this.runtime
    $r.$t.raiseCurrentThreadPCToBlockingLev();
    assertNormalState("send")
    $r.$t.raiseCurrentThreadPC(larg.lev);

    // Accept 2-tuple or 3-tuple
    const arity = larg.val.length;
    if (arity !== 2 && arity !== 3) {
        throw new TroupeError(
            "send expects 2 or 3 arguments: (pid, message) or (pid, message, qauth)"
        );
    }

    assertIsProcessId(larg.val[0]);
    let arg = larg.val;

    let lRecipientPid = arg[0];
    $r.$t.raiseCurrentThreadPC(lRecipientPid.lev);
    let message = arg[1];

    // Extract optional quarantine authority
    let quarantineAuth: Level | null = null;
    if (arity === 3) {
        let authArg = arg[2];
        $r.$t.raiseCurrentThreadPC(authArg.lev);
        assertIsAuthority(authArg.val);
        quarantineAuth = authArg.val.authorityLevel;
    }

    // Use new method that supports quarantine authority
    return $r.sendMessageWithQuarantineAuth(lRecipientPid, message, quarantineAuth);
}, "send");
```

## Dependencies

1. Need to ensure `assertIsAuthority` exists in `Asserts.mts`
2. Need to add `sendMessageWithQuarantineAuth` to RuntimeInterface (Step 4.2)

## Check Asserts.mts

First check if `assertIsAuthority` exists. If not, add it:

```typescript
export function assertIsAuthority(v: any): asserts v is Authority {
    if (!(v instanceof Authority)) {
        throw new TroupeError(`Expected Authority, got ${typeof v}`);
    }
}
```

## Verification

After completing Step 4.2:
```bash
make rt
```

## Completion Checklist

- [ ] assertIsAuthority exists or added to Asserts.mts
- [ ] send.mts modified to accept 2 or 3-tuple
- [ ] Imports added for Authority and assertIsAuthority
- [ ] `make rt` succeeds (after Step 4.2)
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

This step depends on Step 4.2 being completed for full compilation, as it calls a method that doesn't exist yet. Can stub the method first.

(Add any implementation notes here after completion)
