# Step 2.4: Add raiseIntegrityTo() Method

**Status**: REMOVED

---

## Reason for Removal

This step was removed because:

1. **Misleading name**: "raiseIntegrityTo" suggests strengthening integrity, but we're actually constraining/lowering it to the trust level.

2. **Doesn't belong in DCLabel**: This is an ingress-specific operation. DCLabel is a general-purpose label class and shouldn't contain quarantine-ingress semantics.

3. **Simple enough to inline**: The operation is just:
   ```typescript
   new DCLabel(dcLevel.confidentiality, trustDC.integrity)
   ```
   This can be done inline in `deserialize.mts` where the ingress logic lives.

## Correct Approach

In step-3.1 (three-case ingress logic), for `integrity_overclaim` with `RAISE_TAINT` action:

```typescript
case 'integrity_overclaim':
    const action = getIntegrityOnlyDistrustAction();
    if (action === IntegrityOnlyDistrustAction.RAISE_TAINT) {
        // Inline: constrain integrity to trust level
        return new DCLabel(dcLevel.confidentiality, trustDC.integrity);
    } else {
        // QUARANTINE: full quarantine
        this._ingressResult = IngressResult.QUARANTINE;
        return dcLevel.quarantine(this.quarantineTag);
    }
```

## Notes

- Removed 2026-01-24 to keep DCLabel as a clean general-purpose label class.
- The inline approach is clearer about what's happening (constraining, not "raising").
