# Stage 2: Core AST Migration

**Status**: Not started
**Depends on**: Stage 1 complete

## Overview

Migrate `Core.hs` and `DirectWOPats.hs` to use the `Located` wrapper instead of embedded `PosInf`.

## Files to Modify

- `compiler/src/Core.hs`
- `compiler/src/DirectWOPats.hs`

## Implementation

### 1. Add Pragma and Imports

```haskell
{-# LANGUAGE PatternSynonyms #-}

import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, ...)
```

### 2. Define Located Type Alias

```haskell
type LTerm = Located Term
```

### 3. Transform Term Data Type

**Before:**
```haskell
data Term
    = Var VarAccess PosInf
    | Abs Lambda PosInf
    | App Term Term PosInf
    | Let Decl Term PosInf
    | If Term Term Term PosInf
    -- ... all with PosInf
```

**After:**
```haskell
data Term
    = Var VarAccess
    | Abs Lambda
    | App LTerm LTerm
    | Let Decl LTerm
    | If LTerm LTerm LTerm
    -- ... no PosInf, sub-terms are LTerm
```

### 4. Add Pattern Synonyms

```haskell
pattern Var' :: VarAccess -> LTerm
pattern Var' v <- L _ (Var v)

pattern App' :: LTerm -> LTerm -> LTerm
pattern App' e1 e2 <- L _ (App e1 e2)

pattern If' :: LTerm -> LTerm -> LTerm -> LTerm
pattern If' c t e <- L _ (If c t e)

pattern Let' :: Decl -> LTerm -> LTerm
pattern Let' d e <- L _ (Let d e)

pattern Lit' :: Lit -> LTerm
pattern Lit' l <- L _ (Lit l)

-- Add for all Term constructors
```

### 5. Update GetPosInfo Instance

**Before:**
```haskell
instance GetPosInfo Term where
  posInfo (Var _ p) = p
  posInfo (App _ _ p) = p
  -- 17 cases...
```

**After:**
```haskell
-- GetPosInfo for LTerm comes from Located instance
-- If needed for bare Term, it no longer makes sense
```

### 6. Update lower Function

**Before:**
```haskell
lower (D.App e [] pi) = Core.App (lower e) (Lit LUnit) pi
```

**After:**
```haskell
lower (D.App e [] pi) = L pi (App (lower e) (L NoPos (Lit LUnit)))
```

### 7. Apply Similar Changes to DirectWOPats.hs

The Direct AST should follow the same pattern.

## Usage Examples

```haskell
-- When you need position:
transform (L pos (App e1 e2)) = L pos (App (transform e1) (transform e2))

-- When you don't care about position:
simplify (App' (Lit' (LBool True)) e2) = e2
```

## Verification

```bash
make compiler && make test
```

## Commit

```
refactor(compiler): migrate Core AST to Located wrapper
```
