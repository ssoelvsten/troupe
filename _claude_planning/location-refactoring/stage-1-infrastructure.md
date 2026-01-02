# Stage 1: Infrastructure

**Status**: Complete
**Depends on**: Nothing
**Fresh context**: Yes - start a new Claude Code session for this stage

## Goal

Add the `Located` wrapper type infrastructure without changing any existing code behavior. This is a purely additive change.

## Files to Modify

- `compiler/src/TroupePositionInfo.hs`

## Implementation

### 1. Add Language Pragmas

Add to the top of the file:

```haskell
{-# LANGUAGE DeriveFunctor #-}
{-# LANGUAGE DeriveFoldable #-}
{-# LANGUAGE DeriveTraversable #-}
```

### 2. Add Located Data Type

```haskell
-- | A value annotated with source position information.
-- This wrapper separates position tracking from AST node content,
-- following the GHC approach to source locations.
-- Note: Uses 'Loc' instead of 'L' to avoid conflict with Lexer.L
data Located a = Loc !PosInf a
  deriving (Eq, Show, Generic, Functor, Foldable, Traversable)
```

### 3. Add Serialize Instance

```haskell
instance Serialize a => Serialize (Located a)
```

### 4. Add Helper Functions

```haskell
-- | Extract position from a located value
getLoc :: Located a -> PosInf
getLoc (Loc p _) = p

-- | Extract content from a located value
unLoc :: Located a -> a
unLoc (Loc _ x) = x

-- | Wrap a value with no position information
noLoc :: a -> Located a
noLoc = Loc NoPos

-- | Wrap a value with a specific position
atLoc :: PosInf -> a -> Located a
atLoc = Loc

-- | Map over the content of a located value (same as fmap, but explicit)
mapLoc :: (a -> b) -> Located a -> Located b
mapLoc = fmap

-- | Combine two located values, keeping the position of the first
withLocOf :: Located a -> b -> Located b
withLocOf (Loc p _) x = Loc p x
```

### 5. Add GetPosInfo Instance

```haskell
instance GetPosInfo (Located a) where
  posInfo = getLoc
```

### 6. Update Module Exports

Add to the export list:

```haskell
, Located(..)
, getLoc
, unLoc
, noLoc
, atLoc
, mapLoc
, withLocOf
```

## Verification

```bash
make all && make test
```

This stage only adds new code, so all tests must pass with no behavior change.

## Commit Message

```
refactor(compiler): add Located wrapper type infrastructure

Add GHC-style Located wrapper type for separating position information
from AST node content. This is preparatory work for migrating all AST
types to use Located wrappers.

New exports from TroupePositionInfo:
- Located(..) - wrapper type
- getLoc, unLoc - accessors
- noLoc, atLoc - constructors
- mapLoc, withLocOf - combinators
```

## Next Stage

After committing, update [handoff.md](handoff.md) and proceed to Stage 2 in a fresh context.
