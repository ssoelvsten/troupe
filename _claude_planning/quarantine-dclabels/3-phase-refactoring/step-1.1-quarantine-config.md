# Step 1.1: Create Ingress.mts

**Status**: COMPLETED

---

## Objective

Create a new ingress policy module that defines the `IntegrityOnlyDistrustAction` enum for handling integrity-only overclaim scenarios.

## File to Create

`rt/src/Ingress.mts`

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

- [x] File created at `rt/src/Ingress.mts`
- [x] `make rt` succeeds
- [x] Mark this step COMPLETED in INDEX.md

## Notes

Completed 2026-01-24. File created exactly as specified. Build succeeds.
