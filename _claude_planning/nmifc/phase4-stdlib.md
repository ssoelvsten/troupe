# Phase 4: NMIFC Standard Library

**Status:** Pending

**Purpose:** Provide library functions for assisted NMIFC downgrading using the trust anchor pattern.

---

## Steps

### Step 4.1: Create `nmifc` library module

**File to create:** `lib/nmifc.trp`

### Step 4.2: Implement `nmifc-dc` helper function

**Purpose:** Assisted NMIFC downgrading with trust anchor pattern.

**Signature (draft):**
```troupe
nmifc-dc { f = fn,
           a = valueA,
           b = valueB,
           t = trustLabel,
           auth = authority }
```

**Implementation:**
1. Perform preventive downgrading on `a` and `b` using trust anchor `t`
2. Compute `a ⊓ t` and `b ⊓ t`
3. Run `f(a', b')`
4. Result flows to `t` safely

### Step 4.3: Add supporting utilities

- `isCorrupt` - Expose label corruption check to Troupe programs
- `reflection` - Expose reflection operation
- `trustAnchorMeet` - Helper for the meet operation with trust anchors

---

## Related Documentation

- [nmifc-summary.md](nmifc-summary.md) - NMIFC theory
- [trust-dg.md](trust-dg.md) - Trust anchor pattern

---

## Testing Strategy

- Test library functions
- Test trust anchor patterns end-to-end
- Add demonstrator tests from Category C (trust anchor pattern)
