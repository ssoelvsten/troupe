# Step 2.1: Add isRegularTrust() Function

**Status**: COMPLETED

---

## Objective

Add a function to Ingress.mts that checks if a trust label is "regular" - meaning integrity equals confidentiality (`I_n <=> C_n`).

## File to Modify

`rt/src/Ingress.mts`

## Context

From the specification:
> Quarantining is defined only for nodes with _regular_ trust, which means the nodes with trust label `<C_n, I_n>` such that `I_n <=> C_n`.

## Implementation

Add to Ingress.mts:

```typescript
/**
 * Check if a label has "regular" trust where I ⟺ C.
 *
 * A regular trust label has equivalent integrity and confidentiality,
 * meaning the node is trusted to the same degree for both components.
 *
 * This is used during ingress to determine if partial quarantine logic applies.
 */
export function isRegularTrust(label: DCLabel): boolean {
    return implies(label.integrity, label.confidentiality)
        && implies(label.confidentiality, label.integrity);
}
```

## Verification

```bash
make rt
```

Consider adding a quick test in `tests/_unautomated/claude/`:
```
(* test-is-regular-trust.trp *)
let regularTrust = `<alice ; alice>` in
let irregularTrust = `<alice ; bob>` in
(* These are runtime concepts, may need internal testing *)
print "isRegularTrust check"
```

## Completion Checklist

- [x] Function added to Ingress.mts
- [x] `make rt` succeeds
- [x] Mark this step COMPLETED in INDEX.md

## Notes

Completed 2026-01-24. Added as standalone function in Ingress.mts (refactored from DCLabel method).
