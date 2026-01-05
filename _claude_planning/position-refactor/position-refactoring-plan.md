# Position Information Refactoring Plan

## Status: IN PROGRESS (~60% complete)

**Last updated:** 2026-01-05

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1a-c | DirectWOPats with `LTerm`, remove embedded positions | ✅ COMPLETED |
| Phase 2 | Remove `ErrorPosInf` from RetCPS, RetDFCPS, CPSOpt, RetRewrite | ✅ COMPLETED |
| Phase 3 | Remove `ErrorPosInf` from IR, ClosureConv, IROpt, IR2Raw | ❌ NOT STARTED |
| Phase 4 | Remove `ErrorPosInf` from TroupePositionInfo.hs | ❌ NOT STARTED |

**Remaining work:** Complete Phases 3 and 4 to fully remove `ErrorPosInf` from the codebase.

---

This document consolidates the analysis of position tracking through the Troupe compiler pipeline and provides a plan for refactoring to fix position information inconsistencies.

## Problem Statement

Position information flows through multiple AST representations in the compiler. The current implementation has inconsistencies that prevent proper source location tracking for runtime errors. The most visible symptom: when a literal like `()` causes a type assertion failure, no source location is reported because the position was lost during compilation.

### Root Cause Example

```troupe
then fib (x - 1) + ()
```

The `+` operator generates type assertions for both operands:
1. First operand `fib (x - 1)` has position (from variable access)
2. Second operand `()` has `NoPos` (unit literal position lost)

Generated assertions:
```javascript
/* pos=tests/rt/.../fib-untyped.trp:3:12 */rt.rawAssertIsNumber (_$reg0_val_95);
/* pos= */rt.rawAssertIsNumber (gensym46$$$const);  // <-- NoPos!
```

## Current Position Representation

### `PosInf` (core position type)
```haskell
data PosInf = SrcPosInf String Int Int  -- filename, line, column
            | RTGen String              -- runtime-generated
            | NoPos                     -- no position
```

### `Located` (position wrapper)
```haskell
data Located a = Loc !PosInf a
```

### `ErrorPosInf` (redundant wrapper)
```haskell
newtype ErrorPosInf = ErrorPos PosInf
```

## ErrorPosInf Analysis

### Current Usage Through Pipeline

| Stage | Constructs Using ErrorPosInf |
|-------|------------------------------|
| DirectWOPats | `Error Term ErrorPosInf`, `AssertElseError Term Term Term ErrorPosInf` |
| Core | N/A - unwrapped to `Located` position |
| RetCPS | `Error VarName ErrorPosInf`, `AssertElseError VarName LKTerm VarName ErrorPosInf` |
| IR | `Error VarAccess ErrorPosInf`, `AssertElseError VarAccess IRBBTree VarAccess ErrorPosInf` |
| Raw | N/A - position in `Located RawTerminator` |
| Stack | N/A - position in `Located StackTerminator` |

### ErrorPosInf Flow Analysis

The key insight: **ErrorPosInf is redundant** because it's always derived from `Located` wrapper positions and is recreated at stage boundaries.

**Flow diagram:**
```
DirectWOPats:     Error t (ErrorPos pos)     -- pos from Located wrapper in source
        ↓
Core:             Loc pos (Error lt)          -- ErrorPos unwrapped to Located wrapper
        ↓
RetDFCPS:         Loc pos (Error v (ErrorPos pos))   -- RECREATED from same pos!
        ↓
RetCPS → IR:      passes through unchanged
        ↓
IR2Raw:           Loc errPos (Error r)        -- ErrorPos unwrapped again
        ↓
Raw → Stack:      position in Located wrapper only
```

**Key evidence from code:**

1. **Core.hs** (line 254) unwraps `ErrorPosInf`:
   ```haskell
   lower (D.Error t (ErrorPos p)) = Loc p (Error (lower t))
   ```

2. **RetDFCPS.hs** (line 88) recreates it from the same position:
   ```haskell
   trans lterm (\(Loc _ v) -> return $ Loc pos (Error v (ErrorPos pos)))
   ```

3. **IR2Raw.hs** (line 810) unwraps it again:
   ```haskell
   IR.Error verr (ErrorPos errPos) -> tr2rawError (noLocVA verr) errPos
   ```

4. **CaseElimination.hs** always creates `ErrorPos` from `Located` wrapper positions:
   - Line 230: `ErrorPos patPos` where `patPos = getLoc lpat`
   - Line 250: `ErrorPos pos` where `Loc pos (S.FunDecl ...)`
   - Line 293: `ErrorPos pos` from `Located` case expression wrapper

Since `ErrorPosInf` never carries a position that isn't already in a `Located` wrapper, it provides no additional information - it's defensive redundancy that adds complexity without benefit.

### RetRewrite.hs Special Case

`RetRewrite.hs` uses `ErrorPosInf` in a context reconstruction type:
```haskell
data Context
  = CtxtHole
  | CtxtLetSimple VarName LSimpleTerm Context
  | CtxtLetCont ContDef Context
  | CtxtLetFunK [Located FunDef] Context
  | CtxtAssert VarName VarName ErrorPosInf Context  -- here
```

When reconstructing terms (line 213):
```haskell
reconstructTerm (CtxtAssert vn vn' errPos@(ErrorPos pos) ctxt) lkt =
  Loc pos $ AssertElseError vn (reconstructTerm ctxt lkt) vn' errPos
```

The `ErrorPosInf` is used to reconstruct both the `Located` wrapper position AND pass to `AssertElseError`. This will be simplified when `ErrorPosInf` is removed - the context will store `PosInf` directly.

## Proposed Solution: Option 3 (Located Wrapper in DirectWOPats)

### Overview

Change DirectWOPats to use `Located Term` wrappers instead of embedding positions in each constructor. This:
1. Fixes the root cause - all terms (including literals) get proper positions
2. Makes DirectWOPats consistent with Core's design
3. Allows removal of `ErrorPosInf` from the entire pipeline

### Why Remove ErrorPosInf Entirely?

1. **Single source of truth** - Position only in `Located` wrapper
2. **No redundant conversions** - No wrapping/unwrapping at stage boundaries
3. **Simpler code** - Fewer constructor arguments to thread through
4. **Consistent architecture** - All stages use the same pattern
5. **The claimed distinction doesn't exist** - Comments say ErrorPosInf distinguishes "error source location" from "expression position", but the code shows they're always the same value

### Current DirectWOPats.Term (Inconsistent)

```haskell
data Term
    = Lit Lit                           -- NO position (root cause!)
    | Var VarName PosInf                -- position embedded
    | Abs Lambda PosInf                 -- position embedded
    | App Term [Term] PosInf            -- position embedded
    | Let [Decl] Term PosInf            -- position embedded
    | If Term Term Term PosInf          -- position embedded
    | AssertElseError Term Term Term ErrorPosInf  -- ErrorPosInf
    | Tuple [Term] PosInf               -- position embedded
    | Record Fields PosInf              -- position embedded
    | WithRecord Term Fields PosInf     -- position embedded
    | ProjField Term FieldName PosInf   -- position embedded
    | ProjIdx Term Word PosInf          -- position embedded
    | List [Term] PosInf                -- position embedded
    | ListCons Term Term PosInf         -- position embedded
    | Bin BinOp Term Term PosInf        -- position embedded
    | Un UnaryOp Term PosInf            -- position embedded
    | Error Term ErrorPosInf            -- ErrorPosInf
```

### Proposed DirectWOPats.Term (Consistent)

```haskell
type LTerm = Located Term
type LFields = [(FieldName, LTerm)]

data Term
    = Lit Lit
    | Var VarName
    | Abs Lambda
    | App LTerm [LTerm]
    | Let [Decl] LTerm
    | If LTerm LTerm LTerm
    | AssertElseError LTerm LTerm LTerm   -- NO ErrorPosInf
    | Tuple [LTerm]
    | Record LFields
    | WithRecord LTerm LFields
    | ProjField LTerm FieldName
    | ProjIdx LTerm Word
    | List [LTerm]
    | ListCons LTerm LTerm
    | Bin BinOp LTerm LTerm
    | Un UnaryOp LTerm
    | Error LTerm                          -- NO ErrorPosInf
```

### Files Requiring Changes

#### Phase 1: Remove ErrorPosInf, Add Located to DirectWOPats

| File | Changes |
|------|---------|
| **TroupePositionInfo.hs** | Remove `ErrorPosInf` type and exports |
| **DirectWOPats.hs** | Add `LTerm`, `LFields` types; remove embedded positions from constructors; remove `ErrorPosInf` from Error/AssertElseError |
| **CaseElimination.hs** | Major rewrite - wrap all terms with `Loc pos`; remove `ErrorPos` wrapping |
| **Core.hs** | Simplify `lower` to extract position from `Located` wrapper; no `ErrorPos` handling |

#### Phase 2: Remove ErrorPosInf from CPS stages

| File | Changes |
|------|---------|
| **RetCPS.hs** | Remove `ErrorPosInf` from `Error`, `AssertElseError` constructors |
| **RetDFCPS.hs** | Stop creating `ErrorPos`, use `Located` position directly |
| **CPSOpt.hs** | Update pattern matches (currently just imports) |
| **RetRewrite.hs** | Change `CtxtAssert VarName VarName ErrorPosInf Context` to `CtxtAssert VarName VarName PosInf Context`; update reconstruction |

#### Phase 3: Remove ErrorPosInf from IR stages

| File | Changes |
|------|---------|
| **IR.hs** | Remove `ErrorPosInf` from `Error`, `AssertElseError` terminators |
| **ClosureConv.hs** | Update pattern matches; no `errPos` threading |
| **IROpt.hs** | Update pattern matches |
| **IR2Raw.hs** | Simplified - use `Located` position directly from wrapper |

### Key Transformation Changes

#### CaseElimination.hs (transTerm)

**Current** (loses literal position):
```haskell
transTerm _ (S.Lit lit) = return (T.Lit (transLit lit))
```

**Proposed** (preserves position):
```haskell
transTerm pos (S.Lit lit) = return $ Loc pos (T.Lit (transLit lit))
```

#### Core.hs (lower)

**Current** (special case for literals):
```haskell
lower (D.Lit l) = Loc (litPos l) (Lit (lowerLit l))
  where
    litPos (D.LNumeric _ pi) = pi
    litPos _ = NoPos  -- <-- Bug: non-numeric literals get NoPos

lower (D.Error t (ErrorPos p)) = Loc p (Error (lower t))
```

**Proposed** (uniform handling):
```haskell
lower (Loc pos (D.Lit l)) = Loc pos (Lit (lowerLit l))

lower (Loc pos (D.Error lt)) = Loc pos (Error (lower lt))
```

#### RetDFCPS.hs (transExplicit for Error)

**Current** (recreates ErrorPosInf):
```haskell
transExplicit (Loc pos (Core.Error lterm)) = do
  trans lterm (\(Loc _ v) -> return $ Loc pos (Error v (ErrorPos pos)))
```

**Proposed** (position stays in Located):
```haskell
transExplicit (Loc pos (Core.Error lterm)) = do
  trans lterm (\(Loc _ v) -> return $ Loc pos (Error v))
```

#### IR2Raw.hs

**Current**:
```haskell
IR.Error verr (ErrorPos errPos) -> tr2rawError (noLocVA verr) errPos
```

**Proposed** (position from Located wrapper):
```haskell
IR.Error verr -> tr2rawError (noLocVA verr) pos  -- pos from Loc pos (...)
```

## Testing Strategy

1. **Compilation test** - All existing tests should compile
2. **Golden tests** - Many existing golden tests should pass. Some tests will fail because source map tracking is in development, but do not change any golden files as part of this refactoring.
3. **Position tracking test** - Verify literal positions work:
   ```troupe
   let x = 1 + ()  -- Should report position for ()
   in x
   ```
4. **Source map verification** - Check generated JS has correct positions

## Implementation Order

The refactoring should proceed in phases to maintain a working compiler at each step:

1. **Phase 1a**: Update DirectWOPats.hs with new types (add `LTerm`, keep old constructors temporarily)
2. **Phase 1b**: Update CaseElimination.hs to produce new format
3. **Phase 1c**: Update Core.hs lower function; remove `ErrorPosInf` from DirectWOPats
4. **Phase 2**: Remove `ErrorPosInf` from RetCPS, RetDFCPS, CPSOpt, RetRewrite
5. **Phase 3**: Remove `ErrorPosInf` from IR, ClosureConv, IROpt, IR2Raw
6. **Phase 4**: Remove `ErrorPosInf` from TroupePositionInfo.hs

## Estimated Scope

| Phase | Files | Lines Changed (Est.) | Complexity |
|-------|-------|---------------------|------------|
| 1a-c | DirectWOPats, CaseElimination, Core | ~200 | High |
| 2 | RetCPS, RetDFCPS, CPSOpt, RetRewrite | ~60 | Medium |
| 3 | IR, ClosureConv, IROpt, IR2Raw | ~50 | Medium |
| 4 | TroupePositionInfo | ~10 | Low |
| **Total** | **12 files** | **~320 lines** | - |

## Benefits Summary

1. **Fixes the literal position bug** - All terms get positions, including literals
2. **Eliminates redundant ErrorPosInf** - Simpler code, single source of truth
3. **Consistent architecture** - DirectWOPats matches Core's `Located` pattern
4. **Future-proof** - Easier to add new term types (just use `LTerm`)
5. **Better maintainability** - Clear separation of position and content
