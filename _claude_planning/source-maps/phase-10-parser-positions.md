# Phase 10: Capture Positions in Parser

**Status**: Pending (requires Phase 9 first)

**Goal**: Capture positions from tokens for constructs that don't yet have them.

**Prerequisite**: Phase 9 must be complete - Direct.hs types must have PosInf fields before Parser.y can pass positions to them.

---

## Current State in Parser.y

**Already captured** (using monadic `pos` function):
- LNumeric (lines 244-245)
- Case (line 179)
- ValDecl (line 330)
- FunDecl (lines 356-357)
- AtomsDecl (lines 163, 167)

**Not captured** (need Phase 9 type changes first):
- Bin (lines 181-205) - all binary operators
- Let (lines 171-172)
- App (function application)
- If, Var, Tuple, List, Record, Un, etc.

---

## Phase 10a: High-priority constructs

**File**: `compiler/src/Parser.y`

Capture positions for (in priority order):
1. Binary operators (lines 181-205) - most arithmetic errors
2. Unary operators (lines 206-209)
3. Function application (lines 221-222)
4. If-then-else
5. Let bindings

### Pattern Change

Since `pos` is a monadic function, grammar rules need to use `{% ... %}` for monadic actions:

**Before**:
```haskell
| Expr '+' Expr  { Bin Plus $1 $3 }
```

**After**:
```haskell
| Expr '+' Expr  {% do { p <- pos $2; return (Bin Plus $1 $3 p) } }
```

---

## Phase 10b: Medium-priority constructs

- Field projections
- Variable references
- Lambdas

---

## Test

After completing this phase:
```bash
make compiler
bin/golden --quick
```

All tests should pass. Verify that parser captures real positions for key constructs.

---

## Files Modified

| File | Changes |
|------|---------|
| `compiler/src/Parser.y` | Update grammar rules to capture positions |

---

## Next Phase

After completing this phase, proceed to [Phase 11: Thread Positions Through Pipeline](phase-11-threading.md).
