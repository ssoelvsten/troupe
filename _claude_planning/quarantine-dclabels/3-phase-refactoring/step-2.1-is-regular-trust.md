# Step 2.1: Add isRegularTrust() Method

**Status**: NOT STARTED

---

## Objective

Add a method to DCLabel that checks if a trust label is "regular" - meaning integrity equals confidentiality (`I_n <=> C_n`).

## File to Modify

`rt/src/levels/DCLabels/dclabel.mts`

## Context

From the specification:
> Quarantining is defined only for nodes with _regular_ trust, which means the nodes with trust label `<C_n, I_n>` such that `I_n <=> C_n`.

## Implementation

Add to the DCLabel class:

```typescript
/**
 * Check if this is a "regular" trust label where I <=> C.
 *
 * A regular trust label has equivalent integrity and confidentiality,
 * meaning the node is trusted to the same degree for both components.
 *
 * This is used during ingress to determine if partial quarantine logic applies.
 */
isRegularTrust(): boolean {
    // I <=> C means I => C and C => I
    // For CNF, this is bidirectional implication
    return implies(this.integrity, this.confidentiality)
        && implies(this.confidentiality, this.integrity);
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

- [ ] Method added to DCLabel class
- [ ] `make rt` succeeds
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

(Add any implementation notes here after completion)
