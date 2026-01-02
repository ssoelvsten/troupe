# Phase 13f: Capture Statement Positions as Operand Positions

## Goal

Update `ClosureConv.hs` to capture positions from CPS and pass them to IR. As a first step, we use the **statement position** (the position of the whole expression) for all operands within that statement.

This gives us some operand-level positions without requiring changes to CPS types.

## Why Statement Positions First?

The CPS `SimpleTerm` already has a `PosInf` field for the whole statement:
```haskell
Bin BinOp VarName VarName PosInf  -- This PosInf is the statement position
```

We can use this as a reasonable approximation for operand positions. Later phases will add per-operand precision.

## Files to Modify

- `compiler/src/ClosureConv.hs`

## Changes

### 1. Update cpsToIR for Bin expressions

```haskell
-- Before:
cpsToIR (LetSimple x (CPS.Bin op v1 v2 stPos) kterm _) = do
  va1 <- transVar v1
  va2 <- transVar v2
  tell [Assign x (IR.Bin op va1 va2 NoPos NoPos) stPos]
  cpsToIR kterm

-- After:
cpsToIR (LetSimple x (CPS.Bin op v1 v2 stPos) kterm _) = do
  va1 <- transVar v1
  va2 <- transVar v2
  -- Use statement position for both operands (better than nothing!)
  let opPos = stPos
  tell [Assign x (IR.Bin op va1 va2 opPos opPos) stPos]
  cpsToIR kterm
```

### 2. Update cpsToIR for Un expressions

```haskell
cpsToIR (LetSimple x (CPS.Un op v stPos) kterm _) = do
  va <- transVar v
  tell [Assign x (IR.Un op va (stPos)) stPos]
  cpsToIR kterm
```

### 3. Update cpsToIR for ProjField expressions

```haskell
cpsToIR (LetSimple x (CPS.ProjField v fname stPos) kterm _) = do
  va <- transVar v
  -- Use statement position for both record and field
  tell [Assign x (IR.ProjField va fname (stPos) (stPos)) stPos]
  cpsToIR kterm
```

### 4. Update cpsToIR for ProjIdx expressions

```haskell
cpsToIR (LetSimple x (CPS.ProjIdx v idx stPos) kterm _) = do
  va <- transVar v
  tell [Assign x (IR.ProjIdx va idx (stPos)) stPos]
  cpsToIR kterm
```

## What Changes

- Operand positions are now `stPos` instead of `NoPos`
- Source maps will include mappings for operands
- The mappings point to the whole statement, not the specific operand

## What Does NOT Change

- CPS types (SimpleTerm, KTerm)
- Output JS code (positions only affect source maps)
- Test behavior

## Testing

```bash
make all && make test
```

All tests should pass.

## Verification

Now we should see operand-level mappings in source maps:

```bash
bin/troupec --source-map tests/rt/pos/core/fib10.trp -o /tmp/fib10.js
npx ts-node rt/src/tools/inspect-sourcemap.ts /tmp/fib10.js.map
```

Expected: More mappings than before, pointing to expression locations.

## Limitations

At this point, all operands in an expression like `x - 1` map to the same source position (the whole `x - 1` expression). To get per-operand positions (mapping `x` to its specific location), we need to:

1. Add operand position tracking in CPS (Phase 13g)
2. Capture operand positions in RetDFCPS (Phase 13h)

## Next Phase

Phase 13g: Add optional operand positions to CPS SimpleTerm.
