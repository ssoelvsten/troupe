# Phase 13g: Add Operand Positions to CPS SimpleTerm

## Goal

Add `PosInf` fields to CPS `SimpleTerm` constructors to enable per-operand position tracking.

## Approach

Same pattern as previous phases: add `PosInf` fields, update all pattern matches, pass `NoPos` initially.

## Files to Modify

- `compiler/src/RetCPS.hs`
- `compiler/src/RetDFCPS.hs`
- `compiler/src/CPSOpt.hs`
- `compiler/src/ClosureConv.hs`
- `compiler/src/RetRewrite.hs`
- `compiler/src/RetFreeVars.hs`

## Changes to RetCPS.hs

### 1. Update SimpleTerm with operand positions

```haskell
data SimpleTerm
   = Bin BinOp VarName VarName PosInf PosInf PosInf
   --          op1     op2     op1Pos op2Pos stmtPos
   | Un UnaryOp VarName PosInf PosInf
   --           operand operandPos stmtPos
   | ValSimpleTerm SVal PosInf
   | Tuple [VarName] PosInf
   | Record Fields PosInf
   | WithRecord VarName Fields PosInf
   | ProjField VarName Basics.FieldName PosInf PosInf PosInf
   --          record  fieldName        recordPos fieldPos stmtPos
   | ProjIdx VarName Word PosInf PosInf
   --        tuple   idx  tuplePos stmtPos
   | List [VarName] PosInf
   | ListCons VarName VarName PosInf
   | Base Basics.VarName
   | Lib Basics.LibName Basics.VarName
     deriving (Eq, Show, Ord)
```

### 2. Update GetPosInfo instance

```haskell
instance GetPosInfo SimpleTerm where
  posInfo (Bin _ _ _ _ _ p) = p
  posInfo (Un _ _ _ p) = p
  posInfo (ProjField _ _ _ _ p) = p
  posInfo (ProjIdx _ _ _ p) = p
  -- etc. (unchanged for others)
```

### 3. Update pretty printer

```haskell
ppSimpleTerm (Bin op (VN v1) (VN v2) _ _ _) = ...  -- Ignore position fields
ppSimpleTerm (Un op (VN v) _ _) = ...
-- etc.
```

## Changes to RetDFCPS.hs

### 1. Update all SimpleTerm constructions

```haskell
-- Before:
LetSimple x (CPS.Bin op z1 z2 pos) kterm pos

-- After:
LetSimple x (CPS.Bin op z1 z2 NoPos NoPos pos) kterm pos
```

Similarly for Un, ProjField, ProjIdx.

## Changes to CPSOpt.hs

### 1. Update all pattern matches

```haskell
-- Before:
optSimple (Bin op v1 v2 pos) = ...

-- After:
optSimple (Bin op v1 v2 pos1 pos2 pos) = ...
-- Preserve pos1, pos2 through optimizations
```

## Changes to ClosureConv.hs

### 1. Update pattern matches to extract per-operand positions

```haskell
-- Before (from Phase 13f):
cpsToIR (LetSimple x (CPS.Bin op v1 v2 stPos) kterm _) = do
  va1 <- transVar v1
  va2 <- transVar v2
  let opPos = stPos
  tell [Assign x (IR.Bin op va1 va2 opPos opPos) stPos]
  cpsToIR kterm

-- After:
cpsToIR (LetSimple x (CPS.Bin op v1 v2 opPos1 opPos2 stPos) kterm _) = do
  va1 <- transVar v1
  va2 <- transVar v2
  -- Use per-operand positions if available, else fall back to statement position
  let pos1 = posOrFallback opPos1 stPos
      pos2 = posOrFallback opPos2 stPos
  tell [Assign x (IR.Bin op va1 va2 pos1 pos2) stPos]
  cpsToIR kterm
```

The `posOrFallback` helper was added in Phase 13b:

```haskell
posOrFallback :: PosInf -> PosInf -> PosInf
posOrFallback NoPos fallback = fallback
posOrFallback pos _ = pos
```

## Changes to RetRewrite.hs and RetFreeVars.hs

### 1. Update pattern matches

Update all pattern matches on SimpleTerm to include the new fields:

```haskell
-- Before:
rewriteSimple (Bin op v1 v2 pos) = ...

-- After:
rewriteSimple (Bin op v1 v2 pos1 pos2 pos) = ...
```

## Testing

```bash
make all && make test
```

All tests should pass. Since we pass `NoPos` for all operand positions, behavior is identical to Phase 13f.

## Verification

```bash
bin/troupec --source-map tests/rt/pos/core/fib10.trp -o /tmp/fib10.js
npx ts-node rt/src/tools/inspect-sourcemap.ts /tmp/fib10.js.map
```

Output should be identical to Phase 13f (still using statement positions as fallback).

## Next Phase

Phase 13h: Capture actual operand positions in RetDFCPS.
