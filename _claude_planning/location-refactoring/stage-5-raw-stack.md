# Stage 5: Raw/Stack Representation

**Status**: Not started
**Depends on**: Stages 1-4 complete

## Overview

Migrate Raw and Stack representations to use `Located` wrappers.

## Files to Modify

- `compiler/src/Raw.hs`
- `compiler/src/IR2Raw.hs`
- `compiler/src/Stack.hs`
- `compiler/src/Raw2Stack.hs`

## Implementation

### 1. Add Pragma and Imports (all files)

```haskell
{-# LANGUAGE PatternSynonyms #-}

import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, ...)
```

### 2. Transform Raw Types

**RawInst - Before:**
```haskell
data RawInst
    = AssignRaw RawVar RawExpr PosInf
    | AssignLVal VarName RawExpr PosInf
    | SetState MonComponent RawVar PosInf
    | SetBranchFlag PosInf
    | ...
```

**RawInst - After:**
```haskell
data RawInst
    = AssignRaw RawVar RawExpr
    | AssignLVal VarName RawExpr
    | SetState MonComponent RawVar
    | SetBranchFlag
    | ...

type LRawInst = Located RawInst
```

### 3. Transform Stack Types

Similar transformation for `StackInst` and `StackTerminator`.

### 4. Update IR2Raw Transformation

**Note**: IR2Raw currently uses a reader monad to track current position:

```haskell
type TM = RWS PosInf [RawInst] Int

currentPos :: TM PosInf
currentPos = ask
```

This can be simplified - instead of reader monad, just wrap output:

```haskell
-- Before
assignRExpr e = do
    r <- freshRawVar
    pos <- currentPos
    tell [AssignRaw r e pos]
    return r

-- After
assignRExpr pos e = do
    r <- freshRawVar
    tell [L pos (AssignRaw r e)]
    return r
```

### 5. Update Raw2Stack Transformation

Pass through positions from Raw to Stack representation.

### 6. Add Pattern Synonyms

```haskell
pattern AssignRaw' :: RawVar -> RawExpr -> LRawInst
pattern AssignRaw' v e <- L _ (AssignRaw v e)
```

## Verification

```bash
make compiler && make test
```

## Commit

```
refactor(compiler): migrate Raw/Stack representation to Located wrapper
```
