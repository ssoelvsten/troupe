# Step 1.1: Create QuarantineConfig.mts

**Status**: NOT STARTED

---

## Objective

Create a new configuration module that defines the `IntegrityOnlyDistrustAction` enum for handling integrity-only overclaim scenarios.

## File to Create

`rt/src/QuarantineConfig.mts`

## Implementation

```typescript
'use strict'

/**
 * Actions for handling integrity-only overclaim during ingress.
 *
 * When receiving data where:
 * - Confidentiality (C) is within trust bounds
 * - Integrity (I) exceeds trust bounds
 *
 * Two options:
 * - RAISE_TAINT: Relabel I to I_n (the trust level's integrity)
 * - QUARANTINE: Quarantine both I and C
 */
export enum IntegrityOnlyDistrustAction {
    RAISE_TAINT = 'raise_taint',
    QUARANTINE = 'quarantine'
}

// Default action - quarantine is the safer/stricter option
let _integrityOnlyDistrustAction: IntegrityOnlyDistrustAction = IntegrityOnlyDistrustAction.QUARANTINE;

/**
 * Get the configured action for integrity-only overclaim.
 */
export function getIntegrityOnlyDistrustAction(): IntegrityOnlyDistrustAction {
    return _integrityOnlyDistrustAction;
}

/**
 * Set the action for integrity-only overclaim.
 * Called during runtime initialization based on CLI args.
 */
export function setIntegrityOnlyDistrustAction(action: IntegrityOnlyDistrustAction): void {
    _integrityOnlyDistrustAction = action;
}
```

## Verification

After creating the file:
```bash
make rt
```

Should compile without errors.

## Completion Checklist

- [ ] File created at `rt/src/QuarantineConfig.mts`
- [ ] `make rt` succeeds
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

(Add any implementation notes here after completion)
