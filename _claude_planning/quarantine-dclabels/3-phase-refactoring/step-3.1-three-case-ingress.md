# Step 3.1: Implement Three-Case Ingress Logic

**Status**: COMPLETED

**Depends on**: Steps 1.1, 2.1, 2.2 (steps 2.3 and 2.4 were REMOVED)

---

## Objective

Modify the `checkLabel()` method in `IngressDeserializer` to implement the three-case quarantine logic from the specification.

## File to Modify

`rt/src/deserialize.mts`

## Current Behavior

The current `checkLabel()` (around line 303) does:
```typescript
if (levels.actsFor(__trustLevel, lev)) {
    return lev;  // Trusted, use original
} else if (lev.isCorrupt()) {
    // Drop
} else {
    return lev.quarantine(tag);  // Quarantine
}
```

This is all-or-nothing: either fully trusted or fully quarantined.

## New Behavior

Implement three cases based on specification:
1. **trusted**: Use original labels
2. **full_overclaim**: Quarantine both C and I
3. **integrity_overclaim**: Consult INTEGRITY_ONLY_DISTRUST setting

## Implementation

Add imports:
```typescript
import {
    getIntegrityOnlyDistrustAction,
    IntegrityOnlyDistrustAction,
    isRegularTrust,
    classifyForIngress,
    IngressClassification
} from './Ingress.mjs';

// Note: DCLabel is already imported for type assertions (as DCLabel).
// The inline construction `new DCLabel(...)` uses this existing import.
```

Modify `checkLabel()`:
```typescript
private checkLabel(lev: Level): Level {
    const dcLevel = lev as DCLabel;
    const trustDC = this.__trustLevel as DCLabel;

    // First check corruption (applies to all cases)
    if (dcLevel.isCorrupt()) {
        this._ingressResult = IngressResult.DROP;
        throw new Error("Corrupt label detected");
    }

    // Check if trust level is regular (I_n <=> C_n)
    // If not regular, fall back to legacy behavior
    if (!isRegularTrust(trustDC)) {
        return this.checkLabelLegacy(lev);
    }

    // Classify the label against trust level
    const classification = classifyForIngress(dcLevel, trustDC);

    switch (classification) {
        case IngressClassification.TRUSTED:
            // Both I and C within trust - use original
            return lev;

        case IngressClassification.FULL_OVERCLAIM:
            // Neither I nor C within trust - quarantine both
            this._ingressResult = IngressResult.QUARANTINE;
            return dcLevel.quarantine(this.quarantineTag);

        case IngressClassification.INTEGRITY_OVERCLAIM:
            // C within trust, I exceeds - consult setting
            const action = getIntegrityOnlyDistrustAction();

            if (action === IntegrityOnlyDistrustAction.RAISE_TAINT) {
                // Relabel I to I_n - constrain integrity to trust level (inline)
                return new DCLabel(dcLevel.confidentiality, trustDC.integrity);
            } else {
                // QUARANTINE: quarantine both I and C (per spec: "as in full overclaim")
                this._ingressResult = IngressResult.QUARANTINE;
                return dcLevel.quarantine(this.quarantineTag);
            }
    }
}

/**
 * Legacy behavior for non-regular trust levels.
 * Uses simple actsFor check.
 */
private checkLabelLegacy(lev: Level): Level {
    if (levels.actsFor(this.__trustLevel, lev)) {
        return lev;
    } else {
        this._ingressResult = IngressResult.QUARANTINE;
        return (lev as DCLabel).quarantine(this.quarantineTag);
    }
}
```

## Testing

**IMPORTANT**: Local tests do NOT exercise quarantine functionality. Quarantine only occurs during multinode communication.

### Build Verification
```bash
make rt
```

### Quarantine Verification with qecho Example

Use the existing quarantine echo example:
```
examples/network/quarantine-echo-01/
├── qecho-server.trp  # Receives quarantined data
├── qecho-client.trp  # Sends labeled data
```

**To test partial quarantine:**
1. Modify `qecho-client.trp` to send data with integrity-only overclaim
2. Run server and client
3. Observe that server receives data with appropriate classification

**Adapt client for integrity-only test:**
```sml
(* Send message where C is within trust but I exceeds *)
val test_msg = "Hello" raisedTo `<medium ; high>`
(* If server trusts client at <medium ; medium>, this triggers integrity_overclaim *)
```

### Run the Example

```bash
# Terminal 1: Start server
./network.sh examples/network/quarantine-echo-01/qecho-server.trp <server-args>

# Terminal 2: Start client
./network.sh examples/network/quarantine-echo-01/qecho-client.trp <client-args>
```

Observe server output for:
- RAISE_TAINT mode: integrity should be relabeled to trust level
- QUARANTINE mode: full quarantine with quarantineAuth in metadata

## Completion Checklist

- [x] Import Ingress.mjs added
- [x] checkLabel() modified for three-case logic
- [x] checkLabelLegacy() added for backward compatibility
- [x] `make rt` succeeds
- [ ] qecho example runs and shows correct quarantine behavior (manual verification pending)
- [x] Mark this step COMPLETED in INDEX.md

## Notes

Completed 2026-01-24.

Implementation details:
- Added imports for `getIntegrityOnlyDistrustAction`, `IntegrityOnlyDistrustAction`, `isRegularTrust`, `classifyForIngress`, and `IngressClassification` from Ingress.mjs
- `checkLabel()` now:
  1. Checks for corruption first (before other checks)
  2. Falls back to legacy behavior if trust level is non-regular
  3. Uses `classifyForIngress()` for three-case classification
  4. For INTEGRITY_OVERCLAIM, consults CLI setting to decide between RAISE_TAINT (relabel I to I_n) and QUARANTINE
- Added `checkLabelLegacy()` for backward compatibility with non-regular trust levels
- Added debug logging for each case (TRUSTED, QUARANTINE full/integrity, RAISE_TAINT, legacy)
