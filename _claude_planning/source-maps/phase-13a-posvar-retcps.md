# Phase 13a: Add PosVar/PosField Types to RetCPS.hs (Non-Breaking)

## Problem

Variable references used as operands (e.g., `x` in `x - 1`) have positions in Core but lose them during CPS transformation:

```haskell
-- RetDFCPS.hs line 181
trans (Core.Var (Core.RegVar x) _) context = context (VN x)
```

The `_` discards the position.

## Approach: Parallel Types

Instead of modifying existing types (which would break all downstream modules), we:
1. Add new positioned newtypes alongside existing ones
2. Add conversion functions
3. Leave existing code paths unchanged

This ensures the compiler builds and all tests pass after this phase.

## Files to Modify

- `compiler/src/RetCPS.hs`

## Changes

### 1. Add PosVar newtype (after VarName definition, around line 30)

```haskell
-- | Positioned variable reference - wraps a variable name with its source position
-- Used for tracking operand positions through CPS transformation
data PosVar = PosVar VarName PosInf
  deriving (Eq, Show, Ord)

mkPosVar :: VarName -> PosInf -> PosVar
mkPosVar = PosVar

posVarName :: PosVar -> VarName
posVarName (PosVar v _) = v

posVarPos :: PosVar -> PosInf
posVarPos (PosVar _ p) = p

-- | Strip position, converting PosVar to VarName
stripPosVar :: PosVar -> VarName
stripPosVar = posVarName

-- | Add NoPos to a VarName
unposVar :: VarName -> PosVar
unposVar v = PosVar v NoPos
```

### 2. Add PosField newtype

```haskell
-- | Positioned field name - wraps a field name with its source position
data PosField = PosField Basics.FieldName PosInf
  deriving (Eq, Show, Ord)

mkPosField :: Basics.FieldName -> PosInf -> PosField
mkPosField = PosField

posFieldName :: PosField -> Basics.FieldName
posFieldName (PosField f _) = f

posFieldPos :: PosField -> PosInf
posFieldPos (PosField _ p) = p

-- | Strip position
stripPosField :: PosField -> Basics.FieldName
stripPosField = posFieldName

-- | Add NoPos to a FieldName
unposField :: Basics.FieldName -> PosField
unposField f = PosField f NoPos
```

### 3. Add PosFields type alias and conversion

```haskell
-- | Positioned fields for records
type PosFields = [(PosField, PosVar)]

-- | Convert positioned fields to unpositioned (for compatibility)
stripPosFields :: PosFields -> Fields
stripPosFields = map (\(pf, pv) -> (posFieldName pf, posVarName pv))

-- | Add NoPos to all fields
unposFields :: Fields -> PosFields
unposFields = map (\(f, v) -> (unposField f, unposVar v))
```

### 4. Add GetPosInfo instances

```haskell
instance GetPosInfo PosVar where
    posInfo (PosVar _ p) = p

instance GetPosInfo PosField where
    posInfo (PosField _ p) = p
```

### 5. Update module exports

Add to the export list:

```haskell
module RetCPS (
    -- ... existing exports ...

    -- Positioned types (new)
    , PosVar(..), mkPosVar, posVarName, posVarPos, stripPosVar, unposVar
    , PosField(..), mkPosField, posFieldName, posFieldPos, stripPosField, unposField
    , PosFields, stripPosFields, unposFields
) where
```

## What Does NOT Change

- `Fields` type alias remains: `type Fields = [(Basics.FieldName, VarName)]`
- `SimpleTerm` constructors remain unchanged
- `KTerm` constructors remain unchanged
- All existing code continues to work

## Testing

```bash
make all && ./bin/golden --quick
```

Or step by step:

```bash
make compiler && make libs && make service && make test
```

All must pass. This phase adds types without changing any existing behavior.

## Verification

```bash
# Verify new types are exported
cd compiler && stack ghci src/RetCPS.hs
# Then in GHCi:
# :t mkPosVar
# :t stripPosFields
```

## Next Phase

Phase 13b: Use PosVar in RetDFCPS internally (still converting at boundaries).
