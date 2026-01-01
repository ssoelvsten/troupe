# Phase 9: Add PosInf to Direct Layer

**Status**: Pending

**Goal**: Add position fields to parser AST to prepare for position capture.

---

## Phase 9a: Add PosInf to Direct.hs Term constructors

**File**: `compiler/src/Direct.hs`

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
- Seq
- Hnd
- Error

---

## Phase 9b: Update Parser.y (all NoPos initially)

**File**: `compiler/src/Parser.y`

Update parser rules to pass `NoPos` for all new position fields.

This is a large file with many grammar rules. Each rule that produces a Term constructor with a new PosInf field needs to be updated.

---

## Test

After completing this phase:
```bash
make compiler
bin/golden --quick
```

All tests should pass. Compiler output should be unchanged.

---

## Files Modified

| File | Changes |
|------|---------|
| `compiler/src/Direct.hs` | Add PosInf to Term constructors |
| `compiler/src/Parser.y` | Update grammar rules to pass NoPos |

---

## Next Phase

After completing this phase, proceed to [Phase 10: Capture Positions in Parser](phase-10-parser-positions.md).
