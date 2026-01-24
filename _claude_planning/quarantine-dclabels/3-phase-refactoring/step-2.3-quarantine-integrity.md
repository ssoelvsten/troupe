# Step 2.3: Add quarantineIntegrity() Method

**Status**: NOT STARTED

---

## Objective

Add a method to DCLabel that quarantines only the integrity component, leaving confidentiality unchanged. This is used for integrity-only overclaim with QUARANTINE action.

## File to Modify

`rt/src/levels/DCLabels/dclabel.mts`

## Context

For integrity-only overclaim with QUARANTINE setting, we want to quarantine the integrity but keep the confidentiality as-is (since it was within trust bounds).

**Note**: After further review of the spec, the full overclaim case quarantines BOTH components. For integrity-only with QUARANTINE, the spec also says "quarantine both I and C as in the full overclaim." This step may not be needed if we just use the existing `quarantine()` method.

Re-reading the spec:
> If the setting is `QUARANTINE`, then we quarantine both I and C as in the full overclaim.

So for QUARANTINE action, we use the existing `quarantine()` method. This step is only needed if we want partial quarantine (quarantine I only, keep C). Let's implement it for flexibility.

## Implementation

Add to DCLabel class:

```typescript
/**
 * Quarantine only the integrity component, keeping confidentiality unchanged.
 *
 * This produces a label where:
 * - Confidentiality: unchanged (original C)
 * - Integrity: quarantined (I@n:q)
 *
 * Use case: Integrity-only overclaim where we want partial quarantine.
 *
 * @param tag The quarantine tag (nodeId + quarantineId)
 */
quarantineIntegrity(tag: QuarantineTag): DCLabel {
    return new DCLabel(
        this.confidentiality,  // unchanged
        this.quarantineCNF(this.integrity, tag)  // quarantined
    );
}
```

## Verification

```bash
make rt
```

## Completion Checklist

- [ ] quarantineIntegrity() method added to DCLabel class
- [ ] `make rt` succeeds
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

The spec says for QUARANTINE action, quarantine both. But having this method gives flexibility for future use or if the interpretation changes.

(Add any implementation notes here after completion)
