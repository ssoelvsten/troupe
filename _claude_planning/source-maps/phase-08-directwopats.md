# Phase 8: Add PosInf to DirectWOPats Layer

**Status**: Pending

**Goal**: Add position fields to pattern-eliminated AST so they can receive positions from Direct layer.

---

## Phase 8a: Add PosInf to DirectWOPats.hs Term constructors

**File**: `compiler/src/DirectWOPats.hs`

Add `PosInf` to the same constructors as Core:
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

## Phase 8b: Update CaseElimination.hs (all NoPos)

**File**: `compiler/src/CaseElimination.hs`

Update pattern elimination to pass `NoPos` for all new position fields.

---

## Test

After completing this phase:
```bash
make stack
bin/golden --quick
```

All tests should pass. Compiler output should be unchanged.

---

## Files Modified

| File | Changes |
|------|---------|
| `compiler/src/DirectWOPats.hs` | Add PosInf to Term constructors |
| `compiler/src/CaseElimination.hs` | Update to pass NoPos |

---

## Next Phase

After completing this phase, proceed to [Phase 9: Direct + PosInf](phase-09-direct.md).
