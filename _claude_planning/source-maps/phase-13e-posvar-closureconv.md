# Phase 13e: Add Operand Positions to IR Layer

## Goal

Add `PosInf` fields to `IRExpr` constructors to carry operand positions from CPS to Raw.

## Approach

Same pattern as Phase 13c: add `PosInf` fields, pass `NoPos` initially.

## Files to Modify

- `compiler/src/IR.hs`
- `compiler/src/IROpt.hs`
- `compiler/src/ClosureConv.hs`
- `compiler/src/IR2Raw.hs`

## Changes to IR.hs

### 1. Update IRExpr with optional operand positions

```haskell
data IRExpr
  = Bin Basics.BinOp VarAccess VarAccess (PosInf) (PosInf)
  --                 op1       op2       op1Pos         op2Pos
  | Un Basics.UnaryOp VarAccess (PosInf)
  --                  operand   operandPos
  | Tuple [VarAccess]
  | Record Fields
  | WithRecord VarAccess Fields
  | ProjField VarAccess Basics.FieldName (PosInf) (PosInf)
  --          record    fieldName        recordPos      fieldPos
  | ProjIdx VarAccess Word (PosInf)
  --        tuple     idx  tuplePos
  | List [VarAccess]
  | ListCons VarAccess VarAccess
  | Const C.Lit
  | Base Basics.VarName
  | Lib Basics.LibName Basics.VarName
  deriving (Eq, Show, Generic)
```

### 2. Update pretty printer

```haskell
ppIRExpr :: IRExpr -> PP.Doc
ppIRExpr (Bin op v1 v2 _ _) = ...  -- Ignore positions in pretty printing
ppIRExpr (Un op v _) = ...
ppIRExpr (ProjField v f _ _) = ...
-- etc.
```

## Changes to IROpt.hs

### 1. Update all pattern matches on IRExpr

```haskell
-- Before:
optExpr (Bin op v1 v2) = ...

-- After:
optExpr (Bin op v1 v2 pos1 pos2) = ...
-- Preserve positions through optimization
```

### 2. When constructing new IRExpr, preserve positions

```haskell
-- If we're just transforming operands, keep positions:
Bin op v1' v2' pos1 pos2
```

## Changes to ClosureConv.hs

### 1. Update all IRExpr constructions to pass NoPos

```haskell
-- Wherever we construct Bin:
tell [Assign x (IR.Bin op va1 va2 NoPos NoPos) stPos]

-- Wherever we construct Un:
tell [Assign x (IR.Un op va NoPos) stPos]

-- Wherever we construct ProjField:
tell [Assign x (IR.ProjField va fname NoPos NoPos) stPos]
```

## Changes to IR2Raw.hs

### 1. Update pattern matches to extract positions

```haskell
-- Before:
inst2raw (Assign vn (IR.Bin op va1 va2) pos) = do ...

-- After:
inst2raw (Assign vn (IR.Bin op va1 va2 mPos1 mPos2) pos) = do
  -- ... generate Raw.Bin with mPos1, mPos2
  Raw.Bin op useNative rv1 rv2 mPos1 mPos2
```

### 2. Thread positions through to Raw

The positions flow directly from IR to Raw without modification.

## Testing

```bash
make all && make test
```

Both must pass. Output is identical (all positions are NoPos).

## Verification

```bash
bin/troupec tests/rt/pos/core/fib10.trp -o /tmp/before.js
# Apply changes
make compiler
bin/troupec tests/rt/pos/core/fib10.trp -o /tmp/after.js
diff /tmp/before.js /tmp/after.js  # Should be empty
```

## Next Phase

Phase 13f: Capture statement positions as operand positions in ClosureConv (first real positions!).
