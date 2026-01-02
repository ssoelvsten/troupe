# Stage 1: Infrastructure

**Status**: Not started

## Overview

Add the `Located` wrapper type infrastructure without changing any existing code behavior.

## Files to Modify

- `compiler/src/TroupePositionInfo.hs`

## Implementation

### 1. Add Language Pragmas

```haskell
{-# LANGUAGE DeriveFunctor #-}
{-# LANGUAGE DeriveFoldable #-}
{-# LANGUAGE DeriveTraversable #-}
```

### 2. Add Located Data Type

```haskell
data Located a = L !PosInf a
  deriving (Eq, Show, Generic, Functor, Foldable, Traversable)
```

### 3. Add Serialize Instance

```haskell
instance Serialize a => Serialize (Located a)
```

### 4. Add Helper Functions

```haskell
-- Extract position
getLoc :: Located a -> PosInf
getLoc (L p _) = p

-- Extract content
unLoc :: Located a -> a
unLoc (L _ x) = x

-- Wrap with NoPos
noLoc :: a -> Located a
noLoc = L NoPos

-- Wrap with specific position
atLoc :: PosInf -> a -> Located a
atLoc = L

-- Map over content (same as fmap, but explicit)
mapLoc :: (a -> b) -> Located a -> Located b
mapLoc = fmap
```

### 5. Add GetPosInfo Instance

```haskell
instance GetPosInfo (Located a) where
  posInfo = getLoc
```

### 6. Update Module Exports

Add to export list:
```haskell
, Located(..)
, getLoc
, unLoc
, noLoc
, atLoc
, mapLoc
```

## Verification

```bash
make compiler && make test
```

Should pass with no behavior change - this stage only adds new code.

## Commit

```
refactor(compiler): add Located wrapper type infrastructure
```
