# Position Information Refactoring Plan

## Status: COMPLETED ✅

**Last updated:** 2026-01-05

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1a-c | DirectWOPats with `LTerm`, remove embedded positions | ✅ COMPLETED |
| Phase 2 | Remove `ErrorPosInf` from RetCPS, RetDFCPS, CPSOpt, RetRewrite | ✅ COMPLETED |
| Phase 3 | Remove `ErrorPosInf` from IR, ClosureConv, IROpt, IR2Raw | ✅ COMPLETED |
| Phase 4 | Remove `ErrorPosInf` from TroupePositionInfo.hs | ✅ COMPLETED |

**Summary:** `ErrorPosInf` has been completely removed from the codebase. Position information for errors now comes from `Located` wrappers throughout the pipeline.

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

## ErrorPosInf Analysis (Historical)

> **Note:** This section documents the *previous* state before the refactoring. `ErrorPosInf` has now been completely removed from the codebase.

### Previous Usage Through Pipeline

| Stage | Previous Constructs | Current (After Refactoring) |
|-------|---------------------|----------------------------|
| DirectWOPats | `Error Term ErrorPosInf` | `Error LTerm` - position in `Located` wrapper |
| Core | N/A - unwrapped to `Located` | N/A - position in `Located` wrapper |
| RetCPS | `Error VarName ErrorPosInf` | `Error VarName` - position in `Located` wrapper |
| IR | `Error VarAccess ErrorPosInf` | `Error VarAccess` - position in `Located` wrapper |
| Raw | N/A - position in `Located` | Unchanged |
| Stack | N/A - position in `Located` | Unchanged |

### Current Position Flow (After Refactoring)

**New unified flow diagram:**
```
DirectWOPats:     Loc pos (Error lt)          -- position in Located wrapper
        ↓
Core:             Loc pos (Error lt)          -- position preserved in Located
        ↓
RetDFCPS:         Loc pos (Error v)           -- position preserved in Located
        ↓
RetCPS → IR:      Loc pos (Error va)          -- position preserved in Located
        ↓
IR2Raw:           Loc pos (Error r)           -- position used from Located wrapper
        ↓
Raw → Stack:      position in Located wrapper
```

### Key Code Changes Made

1. **Core.hs** - simplified lowering:
   ```haskell
   lower (Loc pos (D.Error lt)) = Loc pos (Error (lower lt))
   ```

2. **RetDFCPS.hs** - no longer recreates ErrorPosInf:
   ```haskell
   trans lterm (\(Loc _ v) -> return $ Loc pos (Error v))
   ```

3. **IR2Raw.hs** - uses position from Located wrapper:
   ```haskell
   IR.Error verr -> tr2rawError (noLocVA verr) pos  -- pos from Loc pos (...)
   ```

4. **RetRewrite.hs** - context now uses `PosInf` directly:
   ```haskell
   data Context
     = CtxtHole
     | CtxtLetSimple VarName LSimpleTerm Context
     | CtxtLetCont ContDef Context
     | CtxtLetFunK [Located FunDef] Context
     | CtxtAssert VarName VarName PosInf Context  -- Changed from ErrorPosInf
   ```

## Implemented Solution: Located Wrapper in DirectWOPats

### Overview

DirectWOPats now uses `Located Term` wrappers instead of embedding positions in each constructor. This:
1. ✅ Fixes the root cause - all terms (including literals) get proper positions
2. ✅ Makes DirectWOPats consistent with Core's design
3. ✅ Allows removal of `ErrorPosInf` from the entire pipeline

### Benefits Achieved

1. **Single source of truth** - Position only in `Located` wrapper
2. **No redundant conversions** - No wrapping/unwrapping at stage boundaries
3. **Simpler code** - Fewer constructor arguments to thread through
4. **Consistent architecture** - All stages use the same pattern
5. **The claimed distinction doesn't exist** - Comments said ErrorPosInf distinguishes "error source location" from "expression position", but the code showed they were always the same value

### Previous DirectWOPats.Term (Before Refactoring)

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

### Current DirectWOPats.Term (After Refactoring)

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

### Files Changed

#### Phase 1: Remove ErrorPosInf, Add Located to DirectWOPats ✅

| File | Changes | Status |
|------|---------|--------|
| **DirectWOPats.hs** | Added `LTerm`, `LFields` types; removed embedded positions from constructors | ✅ Done |
| **CaseElimination.hs** | Major rewrite - wrap all terms with `Loc pos` | ✅ Done |
| **Core.hs** | Simplified `lower` to extract position from `Located` wrapper | ✅ Done |

#### Phase 2: Remove ErrorPosInf from CPS stages ✅

| File | Changes | Status |
|------|---------|--------|
| **RetCPS.hs** | Removed `ErrorPosInf` from `Error`, `AssertElseError` constructors | ✅ Done |
| **RetDFCPS.hs** | Stopped creating `ErrorPos`, use `Located` position directly | ✅ Done |
| **CPSOpt.hs** | Updated pattern matches | ✅ Done |
| **RetRewrite.hs** | Changed `CtxtAssert` to use `PosInf` instead of `ErrorPosInf` | ✅ Done |

#### Phase 3: Remove ErrorPosInf from IR stages ✅

| File | Changes | Status |
|------|---------|--------|
| **IR.hs** | Removed `ErrorPosInf` from `Error`, `AssertElseError` terminators | ✅ Done |
| **ClosureConv.hs** | Removed `ErrorPos` creation, use position from `Located` wrapper | ✅ Done |
| **IROpt.hs** | Updated pattern matches | ✅ Done |
| **IR2Raw.hs** | Uses `Located` position directly from wrapper | ✅ Done |

#### Phase 4: Remove ErrorPosInf from TroupePositionInfo.hs ✅

| File | Changes | Status |
|------|---------|--------|
| **TroupePositionInfo.hs** | Removed `ErrorPosInf` type and exports | ✅ Done |

### Key Transformation Changes (Implemented)

#### CaseElimination.hs (transTerm)

**Before** (loses literal position):
```haskell
transTerm _ (S.Lit lit) = return (T.Lit (transLit lit))
```

**After** (preserves position):
```haskell
transTerm pos (S.Lit lit) = return $ Loc pos (T.Lit (transLit lit))
```

#### Core.hs (lower)

**Before** (special case for literals):
```haskell
lower (D.Lit l) = Loc (litPos l) (Lit (lowerLit l))
  where
    litPos (D.LNumeric _ pi) = pi
    litPos _ = NoPos  -- <-- Bug: non-numeric literals get NoPos

lower (D.Error t (ErrorPos p)) = Loc p (Error (lower t))
```

**After** (uniform handling):
```haskell
lower (Loc pos (D.Lit l)) = Loc pos (Lit (lowerLit l))

lower (Loc pos (D.Error lt)) = Loc pos (Error (lower lt))
```

#### RetDFCPS.hs (transExplicit for Error)

**Before** (recreates ErrorPosInf):
```haskell
transExplicit (Loc pos (Core.Error lterm)) = do
  trans lterm (\(Loc _ v) -> return $ Loc pos (Error v (ErrorPos pos)))
```

**After** (position stays in Located):
```haskell
transExplicit (Loc pos (Core.Error lterm)) = do
  trans lterm (\(Loc _ v) -> return $ Loc pos (Error v))
```

#### IR2Raw.hs

**Before**:
```haskell
IR.Error verr (ErrorPos errPos) -> tr2rawError (noLocVA verr) errPos
```

**After** (position from Located wrapper):
```haskell
IR.Error verr -> tr2rawError (noLocVA verr) pos  -- pos from Loc pos (...)
```

## Testing Results

1. ✅ **Compilation test** - All existing tests compile
2. ✅ **Golden tests** - Same pass/fail rate as before refactoring (32 failing tests are pre-existing source map issues, not caused by this refactoring)
3. ✅ **Position tracking test** - Error positions are correctly embedded in error messages
4. ⚠️ **Source map verification** - The `>> at` line in error output is a separate source map tracking issue being addressed independently

## Implementation Order (Completed)

1. ✅ **Phase 1a**: Updated DirectWOPats.hs with new types (added `LTerm`)
2. ✅ **Phase 1b**: Updated CaseElimination.hs to produce new format
3. ✅ **Phase 1c**: Updated Core.hs lower function; removed `ErrorPosInf` from DirectWOPats
4. ✅ **Phase 2**: Removed `ErrorPosInf` from RetCPS, RetDFCPS, CPSOpt, RetRewrite
5. ✅ **Phase 3**: Removed `ErrorPosInf` from IR, ClosureConv, IROpt, IR2Raw
6. ✅ **Phase 4**: Removed `ErrorPosInf` from TroupePositionInfo.hs

## Actual Scope

| Phase | Files | Status |
|-------|-------|--------|
| 1a-c | DirectWOPats, CaseElimination, Core | ✅ Completed |
| 2 | RetCPS, RetDFCPS, CPSOpt, RetRewrite | ✅ Completed |
| 3 | IR, ClosureConv, IROpt, IR2Raw | ✅ Completed |
| 4 | TroupePositionInfo | ✅ Completed |
| **Total** | **12 files** | **✅ All Complete** |

## Benefits Achieved

1. ✅ **Fixes the literal position bug** - All terms get positions, including literals
2. ✅ **Eliminates redundant ErrorPosInf** - Simpler code, single source of truth
3. ✅ **Consistent architecture** - DirectWOPats matches Core's `Located` pattern
4. ✅ **Future-proof** - Easier to add new term types (just use `LTerm`)
5. ✅ **Better maintainability** - Clear separation of position and content
