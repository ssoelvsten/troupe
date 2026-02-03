# Step 2.2: Add classifyForIngress() Function

**Status**: COMPLETED

**Depends on**: Step 2.1

---

## Objective

Add a function to Ingress.mts that classifies an incoming label against a trust level into one of three cases:
- `TRUSTED`: Both I and C are within trust bounds
- `FULL_OVERCLAIM`: Neither I nor C is within trust bounds
- `INTEGRITY_OVERCLAIM`: C is within trust, but I exceeds trust

## File to Modify

`rt/src/Ingress.mts`

## Context

From the specification, three cases:

1. **Claim within trust**: `I_n => I` and `C_n => C` → use original labels
2. **Full overclaim**: NOT(`I_n => I`) and NOT(`C_n => C`) → quarantine both
3. **Integrity overclaim**: `C_n => C` but NOT(`I_n => I`) → consult setting

## Implementation

Add enum and function to Ingress.mts:

```typescript
/**
 * Classification of a label for ingress quarantine decision.
 */
export enum IngressClassification {
    /** Trust level covers this label - no quarantine needed */
    TRUSTED = 'trusted',
    /** Neither component within trust - full quarantine */
    FULL_OVERCLAIM = 'full_overclaim',
    /** Confidentiality OK, integrity exceeds trust */
    INTEGRITY_OVERCLAIM = 'integrity_overclaim'
}

/**
 * Classify a label for ingress quarantine decision.
 *
 * Given a trust level <C_n, I_n>, determines how to handle the incoming label:
 * - TRUSTED: Trust level acts-for this label (no quarantine needed)
 * - FULL_OVERCLAIM: Neither component within trust (full quarantine)
 * - INTEGRITY_OVERCLAIM: Confidentiality within trust, integrity exceeds
 *
 * @param label The incoming label to classify
 * @param trustLevel The receiving node's trust level for the sender
 * @returns Classification for quarantine decision
 */
export function classifyForIngress(label: DCLabel, trustLevel: DCLabel): IngressClassification {
    const confidentialityWithinTrust = implies(
        trustLevel.confidentiality,
        label.confidentiality
    );

    const integrityWithinTrust = implies(
        trustLevel.integrity,
        label.integrity
    );

    if (confidentialityWithinTrust && integrityWithinTrust) {
        return IngressClassification.TRUSTED;
    }

    if (confidentialityWithinTrust && !integrityWithinTrust) {
        return IngressClassification.INTEGRITY_OVERCLAIM;
    }

    return IngressClassification.FULL_OVERCLAIM;
}
```

## Verification

```bash
make rt
```

## Completion Checklist

- [x] IngressClassification enum added to Ingress.mts
- [x] classifyForIngress() function added to Ingress.mts
- [x] `make rt` succeeds
- [x] Mark this step COMPLETED in INDEX.md

## Notes

Completed 2026-01-24. Refactored from DCLabel method to standalone function in Ingress.mts. Changed from string union type to enum for better IDE support.
