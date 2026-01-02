# Phase 13c: Add Operand Positions to Raw Layer

## Goal

Add `PosInf` fields to `RawExpr` constructors to carry operand positions from IR to Stack/JS generation.

## Approach

Add `PosInf` fields for operand positions, defaulting to `NoPos`. This is consistent with how Phases 6-12 added statement-level positions.

## Files to Modify

- `compiler/src/Raw.hs`
- `compiler/src/IR2Raw.hs`
- `compiler/src/RawOpt.hs`
- `compiler/src/Raw2Stack.hs`
- `compiler/src/RawDefUse.hs`

## Changes to Raw.hs

### 1. Update RawExpr with operand positions

```haskell
data RawExpr
  = Bin Basics.BinOp UseNativeBinop RawVar RawVar PosInf PosInf
  --                                op1    op2    op1Pos op2Pos
  | Un Basics.UnaryOp RawVar PosInf
  --                  operand operandPos
  | Tuple [VarAccess]  -- No change needed
  | Record Fields
  | WithRecord RawVar Fields
  | ProjField RawVar Basics.FieldName PosInf PosInf
  --          record fieldName        recordPos fieldPos
  | ProjIdx RawVar Word PosInf
  --        tuple  idx  tuplePos
  | List [VarAccess]
  | ListCons VarAccess RawVar
  | Const C.Lit
  | MkClos VarName [VarName]
  | Base Basics.VarName
  | Lib Basics.LibName Basics.VarName
  deriving (Eq, Show, Generic)
```

### 2. Update pretty printer

```haskell
ppRawExpr :: RawExpr -> PP.Doc
ppRawExpr (Bin op _ v1 v2 _ _) = ...  -- Ignore position fields in pretty printing
ppRawExpr (Un op v _) = ...
ppRawExpr (ProjField v f _ _) = ...
-- etc.
```

### 3. Ensure Serialize instance still works

The Generic derive should handle the new fields automatically.

## Changes to IR2Raw.hs

### 1. Update all RawExpr constructions to pass NoPos

```haskell
-- Wherever we construct Bin:
Raw.Bin op useNative rv1 rv2 NoPos NoPos

-- Wherever we construct Un:
Raw.Un op rv NoPos

-- Wherever we construct ProjField:
Raw.ProjField rv fname NoPos NoPos
```

This is a mechanical change - add `NoPos` for each new position field.

## Changes to RawOpt.hs

### 1. Update pattern matches to include new fields

```haskell
-- Before:
optimizeExpr (Bin op native rv1 rv2) = ...

-- After:
optimizeExpr (Bin op native rv1 rv2 pos1 pos2) = ...
-- Preserve pos1 and pos2 through optimization
```

### 2. Ensure positions are preserved through optimizations

When reconstructing a `Bin` or other expression after optimization, carry through the original positions:

```haskell
-- If we substitute rv1 with rv1', keep the position:
Bin op native rv1' rv2 pos1 pos2
```

## Changes to Raw2Stack.hs

### 1. Update pattern matches

Pattern matches need to include the new fields (can be `_` if not used yet):

```haskell
raw2stack (AssignRaw rv (Bin op native v1 v2 _ _) pos) = ...
```

## Changes to RawDefUse.hs

### 1. Update pattern matches

Similar to RawOpt.hs, update all pattern matches on `RawExpr`.

## Testing

```bash
make all && make test
```

Both must pass. Output is identical (all positions are NoPos).

## Verification

Compile a test file and verify byte-for-byte identical output:

```bash
bin/troupec tests/rt/pos/core/fib10.trp -o /tmp/before.js
# Apply changes
make compiler
bin/troupec tests/rt/pos/core/fib10.trp -o /tmp/after.js
diff /tmp/before.js /tmp/after.js  # Should be empty
```

## Next Phase

Phase 13d: Emit operand markers in Stack2JS when positions are present.
