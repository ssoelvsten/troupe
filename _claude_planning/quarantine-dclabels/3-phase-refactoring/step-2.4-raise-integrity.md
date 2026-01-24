# Step 2.4: Add raiseIntegrityTo() Method

**Status**: NOT STARTED

---

## Objective

Add a method to DCLabel that raises the integrity component to match a given integrity level. This is used for integrity-only overclaim with RAISE_TAINT action.

## File to Modify

`rt/src/levels/DCLabels/dclabel.mts`

## Context

From the specification:
> If the setting is `RAISE_TAINT`, then we relabel I to I_n.

This means replacing the claimed integrity with the trust level's integrity.

## Implementation

Add to DCLabel class:

```typescript
/**
 * Raise integrity to match the given integrity level.
 *
 * This produces a label where:
 * - Confidentiality: unchanged (original C)
 * - Integrity: replaced with trustIntegrity (I_n)
 *
 * Use case: Integrity-only overclaim with RAISE_TAINT action.
 * The claimed integrity is untrusted, so we "raise" (worsen) it to
 * the trust level's integrity, which is more conservative.
 *
 * @param trustIntegrity The trust level's integrity to use
 */
raiseIntegrityTo(trustIntegrity: CNF): DCLabel {
    return new DCLabel(
        this.confidentiality,  // unchanged
        trustIntegrity         // replaced with trust integrity
    );
}
```

## Semantics Note

"Raise" here means making the integrity label less trusted (higher in the lattice toward untrusted). By replacing the claimed integrity with I_n, we're saying "we don't trust your integrity claim, so we'll use the integrity level we actually trust you for."

## Verification

```bash
make rt
```

## Completion Checklist

- [ ] raiseIntegrityTo() method added to DCLabel class
- [ ] `make rt` succeeds
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

(Add any implementation notes here after completion)
