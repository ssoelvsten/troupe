# Quarantine Ingress Implementation Plan

## Summary

The quarantine protocol requires **attenuating (downgrading) the security level of incoming messages** from remote nodes when the node's trust level is insufficient for the message's claimed label. This prevents untrusted nodes from injecting high-integrity or high-confidentiality data into the system.

## Current State (after commit `1b349cb`)

- Message metadata uses record `{senderNode=nodeId}` (done in commit `e3f37bc`)
- `fromNodeId` label now uses `lub(pc, t.pcAtCreation())` (done in commit `1b349cb`)
- `addMessage` now takes raw `fromNode: string` and constructs the labeled value internally
- **Missing**: Quarantine authority field and ingress check logic

## Key Insight: Messages Are Aggregates

**Critical**: Messages can be aggregates (tuples, records, lists) where **each component has a different label**. The quarantine check cannot happen at the top-level `receiveFromRemote()` - it must happen **during deserialization** when each labeled value is reconstructed.

### Current Deserialization Logic

In [deserialize.mts:284-336](rt/src/deserialize.mts#L284-L336), the `mkValue` function reconstructs each labeled value:

```typescript
function mkValue(arg) {
    let lev = mkLevel(arg.lev);
    let tlev = mkLevel(arg.tlev);

    function _trustGLB(x: Level) {
        return (glb(x, __trustLevel))  // Current: uses GLB
    }
    // ... value reconstruction ...
    return new LVal(value(), _trustGLB(lev), _trustGLB(tlev));  // Line 335
}
```

**Current behavior**: Uses `glb(claimedLevel, trustLevel)` to attenuate levels.

**Problem with GLB**: It assumes partial trust - the result is an intersection of the claimed level and trust level. The quarantine protocol is stricter: if the node is not trusted enough for a level, the data gets a **completely fresh label** that requires explicit authority to downgrade.

## Protocol (from PDF Section 4.1.2)

When deserializing a message from node `n` with trust level `ℓ_n`, the ingress check has **three outcomes**:

1. **TRUSTED**: All labels in the aggregate satisfy `ℓ_n ⪰ ℓ` → return value unchanged
2. **QUARANTINE**: Some label has `ℓ_n ⋡ ℓ` but none are corrupt → return value with a **single** fresh quarantine label
3. **DROP**: Any label is corrupt → drop the message entirely

The key insight is that quarantine is a **message-level** decision, not per-value. A single fresh quarantine label applies to the entire message if any part is untrusted.

---

## Implementation Tasks

### Task 1: Define Ingress Result Type

**File**: [rt/src/deserialize.mts](rt/src/deserialize.mts)

Add an enum/type for the three possible ingress outcomes:

```typescript
export enum IngressResult {
    TRUSTED,      // All labels trusted - use original value
    QUARANTINE,   // Some labels untrusted - apply quarantine label
    DROP          // Corrupt label found - drop message
}

export type DeserializeResult = {
    result: IngressResult;
    value?: LVal;                   // Present if TRUSTED or QUARANTINE
    quarantineAuth?: Level;         // Present if QUARANTINE
}
```

### Task 2: Create `ValueDeserializer` Class with `mkValue` Method

**File**: [rt/src/deserialize.mts](rt/src/deserialize.mts)

Encapsulate the quarantine logic and the `mkValue` function in a class. This avoids threading an extra parameter through all recursive calls.

**Add exception class**:
```typescript
class CorruptDataException extends Error {
    constructor() {
        super("Corrupt data encountered during deserialization");
    }
}
```

**Add `ValueDeserializer` class** (wraps existing `mkValue` logic):

The class is defined **inside `constructCurrent`** so it has closure access to the existing `ctxt` variable (which holds namespaces, closures, envs).

```typescript
function constructCurrent(compilerOutput: string) {
    // ... existing ctxt setup ...

    class ValueDeserializer {
        private _quarantineLabel: Level | null = null;

        /** Lazy getter - creates quarantine label on first access */
        get quarantineLabel(): Level {
            if (this._quarantineLabel === null) {
                this._quarantineLabel = levels.fromSingleTag(uuidv4().toString());
            }
            return this._quarantineLabel;
        }

        /** Returns true if any label was quarantined */
        get wasQuarantined(): boolean {
            return this._quarantineLabel !== null;
        }

        /** Check label and return effective label (original if trusted, quarantine if not) */
        private checkLabel(lev: Level): Level {
            if (levels.actsFor(__trustLevel, lev)) {
                return lev;  // Trusted - use original
            }
            // Not trusted - check if corrupt before quarantining
            if (lev.isCorrupt()) {
                throw new CorruptDataException();
            }
            return this.quarantineLabel;  // Triggers lazy creation
        }

        /** Main deserialization method - adapted from existing mkValue */
        mkValue(arg: { val: any; lev: any; tlev: any; troupeType: Ty.TroupeType }): LVal {
            let lev = mkLevel(arg.lev);
            let tlev = mkLevel(arg.tlev);

            const effectiveLev = this.checkLabel(lev);
            const effectiveTlev = this.checkLabel(tlev);

            // ... existing value() construction logic ...
            // Uses ctxt from closure (namespaces, closures, envs)
            // Uses __trustLevel from module scope
            // Recursive calls use this.mkValue() instead of mkValue()

            return new LVal(value(), effectiveLev, effectiveTlev);
        }
    }

    // ... use ValueDeserializer instance ...
}
```

The single pass:
1. Each label is checked via `this.checkLabel()`
2. If corrupt → throws `CorruptDataException` immediately
3. If untrusted → returns quarantine label (lazily created once per instance)
4. If trusted → returns original label
5. After construction, `deserializer.wasQuarantined` indicates the outcome

### Task 3: Add Exception Handling in `constructCurrent`

**File**: [rt/src/deserialize.mts:346](rt/src/deserialize.mts#L346)

Create a `ValueDeserializer` instance and call its `mkValue` method. Wrap with try/catch for `CorruptDataException`. The callback receives `DeserializeResult` instead of raw `LVal`.

**Modify `constructCurrent`** (around line 346):
```typescript
const deserializer = new ValueDeserializer();

let result: DeserializeResult;
try {
    let v = deserializer.mkValue(serobj.value);
    if (deserializer.wasQuarantined) {
        result = {
            result: IngressResult.QUARANTINE,
            value: v,
            quarantineAuth: deserializer.quarantineLabel
        };
    } else {
        result = { result: IngressResult.TRUSTED, value: v };
    }
} catch (e) {
    if (e instanceof CorruptDataException) {
        result = { result: IngressResult.DROP };
    } else {
        throw e;  // Re-throw unexpected errors
    }
}

// ... library loading ...
loadLib(0, () => desercb(result));
```

### Task 3b: Update Callback Types

**File**: [rt/src/deserialize.mts:365-404](rt/src/deserialize.mts#L365-L404)

Update callback signature and `deserialize` return type:

```typescript
function deserializeCb(lev: Level, jsonObj: any, cb: (result: DeserializeResult) => void) {
    // ... existing postpone logic ...
}

export function deserialize(lev: Level, jsonObj: any): Promise<DeserializeResult> {
    return new Promise((resolve, reject) => {
        deserializeCb(lev, jsonObj, (result: DeserializeResult) => {
            resolve(result);
        });
    });
}
```

### Task 4: Update `receiveFromRemote` to Handle Ingress Results

**File**: [rt/src/runtimeMonitored.mts:183-194](rt/src/runtimeMonitored.mts#L183-L194)

Update to handle the three outcomes:

```typescript
async function receiveFromRemote(pid, jsonObj, fromNode) {
    debug(`* rt receiveFromremote *  ${JSON.stringify(jsonObj)}`)

    const result = await DS.deserialize(nodeTrustLevel(fromNode), jsonObj);

    if (result.result === DS.IngressResult.DROP) {
        debug(`Dropping corrupt message from ${fromNode}`);
        return;  // Silent drop
    }

    const data = result.value;
    debug(`* rt receiveFromremote *  ${fromNode} ${data.stringRep()}`);

    let toPid = new LVal(new ProcessID(rt_uuid, pid, __nodeManager.getLocalNode()), data.lev);

    // Pass quarantine authority if present
    const quarantineAuth = result.result === DS.IngressResult.QUARANTINE
        ? result.quarantineAuth
        : null;

    __theMailbox.addMessage(fromNode, toPid, data.val, data.lev, quarantineAuth);
    __sched.resumeLoopAsync();
}
```

### Task 5: Update `addMessage` and `createMessage` for Quarantine Authority

**File**: [rt/src/MailboxProcessor.mts:25-31, 51-77](rt/src/MailboxProcessor.mts#L25-L77)

Update signatures to accept and propagate quarantine authority:

```typescript
function createMessage(msg, fromNodeId, pc, quarantineAuth = null) {
    let metadataFields: [string, any][] = [["senderNode", fromNodeId]];
    if (quarantineAuth !== null) {
        metadataFields.push(["quarantineAuth", new LVal(quarantineAuth, quarantineAuth)]);
    }
    let metadata = Record.mkRecord(metadataFields);
    let tuple = mkTuple([msg, new LVal(metadata, fromNodeId.lev)]);
    return new MbVal(tuple, pc);
}

addMessage(fromNode: string, toPid, message, pc, quarantineAuth = null) {
    // ... existing code ...
    let messageWithSenderId = createMessage(message, fromNodeId, pc, quarantineAuth);
    // ... rest unchanged ...
}
```

### Task 6: Add Required Imports

**File**: [rt/src/deserialize.mts](rt/src/deserialize.mts)

Add UUID import:
```typescript
import { v4 as uuidv4 } from 'uuid';
```

Note: `levels` namespace already imported at line 17.

---

## Files to Modify

| File                                                        | Lines           | Purpose                                                        |
|-------------------------------------------------------------|-----------------|----------------------------------------------------------------|
| [rt/src/deserialize.mts](rt/src/deserialize.mts)            | 284-336, 398-404 | Add ingress check during `mkValue`, change return type         |
| [rt/src/runtimeMonitored.mts](rt/src/runtimeMonitored.mts)  | 183-194          | Handle `DeserializeResult` outcomes (trusted/quarantine/drop)  |
| [rt/src/MailboxProcessor.mts](rt/src/MailboxProcessor.mts)  | 25-31, 51-77     | Thread `quarantineAuth` through `addMessage`/`createMessage`   |

## Infrastructure Already Available

- `levels.actsFor(a, b)` - checks if `a` acts for `b` (in [Level.mts:12](rt/src/Level.mts#L12))
- `levels.fromSingleTag(s)` - creates fresh label from string (in [Level.mts:25](rt/src/Level.mts#L25))
- `import * as levels from './Level.mjs'` - already exists in deserialize.mts (line 17)
- `isCorrupt()` method on Level/DCLabel (in [dclabel.mts:197](rt/src/levels/DCLabels/dclabel.mts#L197))
- `uuidv4` - needs to be imported in deserialize.mts

## Test Strategy

1. Update example [examples/network/quarantine-echo-01/](examples/network/quarantine-echo-01/) to verify:
   - Untrusted client messages get quarantined (fresh label assigned)
   - Trusted client messages pass through unchanged
   - Handler can access `quarantineAuth` in metadata
2. Run existing multinode tests to ensure no regressions
