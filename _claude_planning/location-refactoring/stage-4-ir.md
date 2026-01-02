# Stage 4: IR Representation

**Status**: Not started
**Depends on**: Stages 1-3 complete

## Overview

Migrate IR types to use `Located` wrappers. Special attention needed for `FunDef` which currently has two `PosInf` fields.

## Files to Modify

- `compiler/src/IR.hs`
- `compiler/src/ClosureConv.hs`

## Implementation

### 1. Add Pragma and Imports

```haskell
{-# LANGUAGE PatternSynonyms #-}

import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, ...)
```

### 2. Define Located Type Aliases

```haskell
type LIRInst = Located IRInst
type LIRTerminator = Located IRTerminator
```

### 3. Transform IR Data Types

**IRInst - Before:**
```haskell
data IRInst
    = Assign VarName IRExpr PosInf
    | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)] PosInf
```

**IRInst - After:**
```haskell
data IRInst
    = Assign VarName IRExpr
    | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]
```

### 4. Special Case: FunDef

**Current (has TWO positions):**
```haskell
data FunDef = FunDef
    HFN              -- function name
    VarName          -- argument name
    PosInf           -- argument position (1st)
    Consts           -- constants
    IRBBTree         -- body
    PosInf           -- function definition position (2nd)
```

**Target (consolidate to single Located):**
```haskell
data FunDef = FunDef
    HFN              -- function name
    VarName          -- argument name
    Consts           -- constants
    IRBBTree         -- body

type LFunDef = Located FunDef
-- Position represents function definition location
-- Argument position can be tracked separately if needed
```

### 5. Add Pattern Synonyms

```haskell
pattern Assign' :: VarName -> IRExpr -> LIRInst
pattern Assign' v e <- L _ (Assign v e)
```

### 6. Update Closure Conversion

Update `ClosureConv.hs` to produce located IR instructions.

## Verification

```bash
make compiler && make test
```

## Commit

```
refactor(compiler): migrate IR representation to Located wrapper
```
