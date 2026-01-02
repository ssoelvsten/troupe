# Stage 3: CPS Representation

**Status**: Not started
**Depends on**: Stages 1-2 complete

## Overview

Migrate the CPS representation to use `Located` wrappers.

## Files to Modify

- `compiler/src/RetCPS.hs`
- `compiler/src/RetDFCPS.hs`

## Implementation

### 1. Add Pragma and Imports

```haskell
{-# LANGUAGE PatternSynonyms #-}

import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, ...)
```

### 2. Define Located Type Aliases

```haskell
type LKTerm = Located KTerm
type LSimpleTerm = Located SimpleTerm
-- etc. as needed
```

### 3. Transform CPS Data Types

Remove `PosInf` from constructors, use `Located` wrappers for sub-terms.

**Example transformation:**
```haskell
-- Before
data KTerm
    = LetSimple VarName SimpleTerm KTerm PosInf
    | KontReturn VarName PosInf
    | ...

-- After
data KTerm
    = LetSimple VarName LSimpleTerm LKTerm
    | KontReturn VarName
    | ...
```

### 4. Add Pattern Synonyms

```haskell
pattern LetSimple' :: VarName -> LSimpleTerm -> LKTerm -> LKTerm
pattern LetSimple' v st kt <- L _ (LetSimple v st kt)

pattern KontReturn' :: VarName -> LKTerm
pattern KontReturn' v <- L _ (KontReturn v)
```

### 5. Update CPS Transformation in RetDFCPS.hs

Update `transExplicit` and related functions to produce `Located` terms:

```haskell
-- Before
transExplicit (Core.Var (Core.RegVar x) pos) =
    return $ KontReturn (VN x) pos

-- After
transExplicit (L pos (Core.Var (Core.RegVar x))) =
    return $ L pos (KontReturn (VN x))
```

## Verification

```bash
make compiler && make test
```

## Commit

```
refactor(compiler): migrate CPS representation to Located wrapper
```
