# Phase 11: Thread Positions Through Pipeline

**Status**: Pending

**Goal**: Pass real positions from parser through all transformation layers to IR.

---

## Phase 11a: DirectWOPats <- Direct (CaseElimination.hs)

**File**: `compiler/src/CaseElimination.hs`

Thread positions from `Direct.Term` to `DirectWOPats.Term`.

Replace `NoPos` with actual position extraction from Direct terms.

---

## Phase 11b: Core <- DirectWOPats (Core.hs lower)

**File**: `compiler/src/Core.hs`

Thread positions from `DirectWOPats.Term` to `Core.Term` in the `lower` function.

---

## Phase 11c: CPS <- Core (RetDFCPS.hs)

**File**: `compiler/src/RetDFCPS.hs`

Thread positions from `Core.Term` to CPS `KTerm`/`SimpleTerm`.

---

## Phase 11d: IR <- CPS (ClosureConv.hs)

**File**: `compiler/src/ClosureConv.hs`

Replace `NoPos` with position extraction from CPS terms.

---

## Test

After completing this phase:
```bash
make compiler
bin/golden --quick
```

All tests should pass. Verify with verbose compiler output (`-v`) that positions flow through all stages.

---

## Files Modified

| File | Changes |
|------|---------|
| `compiler/src/CaseElimination.hs` | Thread positions from Direct to DirectWOPats |
| `compiler/src/Core.hs` | Thread positions in `lower` function |
| `compiler/src/RetDFCPS.hs` | Thread positions to CPS |
| `compiler/src/ClosureConv.hs` | Extract positions from CPS terms |

---

## Next Phase

After completing this phase, proceed to [Phase 12: Emit Real Source Maps](phase-12-emit-source-maps.md).
