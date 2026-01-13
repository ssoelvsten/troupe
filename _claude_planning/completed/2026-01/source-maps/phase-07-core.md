# Phase 7: Add PosInf to Core Layer

**Status**: NEXT

**Goal**: Add position fields to Core types so they can receive positions from DirectWOPats.

---

## Phase 7a: Add PosInf to Core.hs Term constructors

**File**: `compiler/src/Core.hs`

Add `PosInf` to these Term constructors:
- Var
- Abs
- App
- Let
- If
- Tuple
- Record
- WithRecord
- ProjField
- ProjIdx
- List
- ListCons
- Bin
- Un

---

## Phase 7b: Update Core.hs lowering (all NoPos)

**File**: `compiler/src/Core.hs`

Update the `lower` function to pass `NoPos` for all new position fields.

This maintains backward compatibility - positions will flow through once we complete Phase 11.

---

## Test

After completing this phase:
```bash
make compiler
bin/golden --quick
```

All tests should pass (397/397). Compiler output should be unchanged.

---

## Files Modified

| File | Changes |
|------|---------|
| `compiler/src/Core.hs` | Add PosInf to Term constructors, update `lower` |

---

## Next Phase

After completing this phase, proceed to [Phase 8: DirectWOPats + PosInf](phase-08-directwopats.md).
