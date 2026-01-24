# Step 2.2: Add classifyForIngress() Method

**Status**: NOT STARTED

**Depends on**: Step 2.1

---

## Objective

Add a method to DCLabel that classifies an incoming label against a trust level into one of three cases:
- `trusted`: Both I and C are within trust bounds
- `full_overclaim`: Neither I nor C is within trust bounds
- `integrity_overclaim`: C is within trust, but I exceeds trust

## File to Modify

`rt/src/levels/DCLabels/dclabel.mts`

## Context

From the specification, three cases:

1. **Claim within trust**: `I_n => I` and `C_n => C` → use original labels
2. **Full overclaim**: NOT(`I_n => I`) and NOT(`C_n => C`) → quarantine both
3. **Integrity overclaim**: `C_n => C` but NOT(`I_n => I`) → consult setting

## Implementation

Add type and method to DCLabel:

```typescript
export type IngressClassification = 'trusted' | 'full_overclaim' | 'integrity_overclaim';

/**
 * Classify this label for ingress quarantine decision.
 *
 * Given a trust level <C_n, I_n>, determines how to handle this label:
 * - 'trusted': Trust level acts-for this label (no quarantine needed)
 * - 'full_overclaim': Neither component within trust (full quarantine)
 * - 'integrity_overclaim': Confidentiality within trust, integrity exceeds
 *
 * @param trustLevel The receiving node's trust level for the sender
 * @returns Classification for quarantine decision
 */
classifyForIngress(trustLevel: DCLabel): IngressClassification {
    // Check if trust level covers each component
    // C_n => C means trustLevel.confidentiality implies this.confidentiality
    const confidentialityWithinTrust = implies(
        trustLevel.confidentiality,
        this.confidentiality
    );

    // I_n => I means trustLevel.integrity implies this.integrity
    const integrityWithinTrust = implies(
        trustLevel.integrity,
        this.integrity
    );

    if (confidentialityWithinTrust && integrityWithinTrust) {
        return 'trusted';
    }

    if (confidentialityWithinTrust && !integrityWithinTrust) {
        return 'integrity_overclaim';
    }

    // Either both exceed, or only confidentiality exceeds
    // The spec only defines integrity_overclaim separately, so treat
    // confidentiality-only overclaim as full_overclaim
    return 'full_overclaim';
}
```

## Verification

```bash
make rt
```

## Completion Checklist

- [ ] IngressClassification type added
- [ ] classifyForIngress() method added to DCLabel class
- [ ] `make rt` succeeds
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

(Add any implementation notes here after completion)
