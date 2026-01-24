# Step 4.1: Add assertIsTupleWithArity and Modify send.mts

**Status**: NOT STARTED

---

## Objective

1. Add new `assertIsTupleWithArity` assertion that preserves blocking level semantics
2. Modify `send` builtin to accept 2-tuple or 3-tuple

## Files to Modify

1. `rt/src/Asserts.mts`
2. `rt/src/builtins/send.mts`

## Key Design Decision

**Why not manual arity checking?** The existing `assertIsNTuple(x, n)` raises the blocking level via `_thread().raiseBlockingThreadLev(x.lev)`. Manual arity checks would silently drop this IFC-critical behavior.

## Implementation

### Part A: Add to Asserts.mts

```typescript
/**
 * Assert x is a tuple with arity in the given set.
 * Raises blocking level like assertIsNTuple.
 */
export function assertIsTupleWithArity(
    x: any,
    allowedArities: number[],
    source: AssertionSource = AssertionSource.AssertInBuiltIn
) {
    _thread().raiseBlockingThreadLev(x.lev);  // Critical: preserve blocking level
    if (!(Array.isArray(x.val) && isTupleFlagSet(x.val))) {
        err("value " + __stringRep(x) + " is not a tuple", source);
    }
    if (!allowedArities.includes(x.val.length)) {
        const aritiesStr = allowedArities.join(" or ");
        err(`expected ${aritiesStr}-tuple, got ${x.val.length}-tuple`, source);
    }
}
```

### Part B: Modify send.mts

```typescript
import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { assertNormalState, assertIsTupleWithArity, assertIsProcessId, assertIsAuthority } from '../Asserts.mjs'
import { Authority } from '../Authority.mjs';

export function BuiltinSend<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        send = mkBase((larg) => {
            let $r = this.runtime
            $r.$t.raiseCurrentThreadPCToBlockingLev();
            assertNormalState("send")
            $r.$t.raiseCurrentThreadPC(larg.lev);

            // New: accept 2 or 3-tuple
            assertIsTupleWithArity(larg, [2, 3]);
            assertIsProcessId(larg.val[0]);

            let arg = larg.val;
            let lRecipientPid = arg[0];
            $r.$t.raiseCurrentThreadPC(lRecipientPid.lev);
            let message = arg[1];

            if (arg.length === 2) {
                // Standard 2-tuple send - no qauth
                return $r.sendMessageNoChecks(lRecipientPid, message);
            } else {
                // 3-tuple send with quarantine authority
                let authArg = arg[2];
                // assertIsAuthority raises blocking level via raiseBlockingThreadLev
                assertIsAuthority(authArg);
                let qauth: Authority = authArg.val;
                return $r.sendMessageNoChecks(lRecipientPid, message, qauth);
            }
        }, "send");
    }
}
```

## Verification

After completing Step 4.3:
```bash
make rt
```

## Completion Checklist

- [ ] assertIsTupleWithArity added to Asserts.mts
- [ ] send.mts modified to accept 2 or 3-tuple
- [ ] Imports added for Authority and assertIsAuthority
- [ ] `make rt` succeeds (after Step 4.3)
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

- `assertIsTupleWithArity` replaces manual arity checking to preserve IFC semantics
- `Authority` type used instead of `Level | null` - matches actual runtime type
- No explicit PC raise for authArg - blocking level raised by assertIsAuthority (same pattern as downgrading.mts)
