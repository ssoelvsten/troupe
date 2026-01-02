# Phase 13h: Capture Actual Operand Positions in RetDFCPS

## Goal

Update `RetDFCPS.hs` to capture the actual source positions of operands (e.g., the position of variable `x` in expression `x - 1`).

## The Challenge

The CPS transform's `trans` function takes a context callback that receives a `VarName`:

```haskell
trans :: Core.Term -> (VarName -> S KTerm) -> S KTerm
```

When we call `trans e1 (\v1 -> trans e2 (\v2 -> ...))`, we get `v1` and `v2` as `VarName` values, but we've lost the position information from `e1` and `e2`.

## Solution: Capture positions before transformation

We capture the position of each Core.Term before calling `trans`, so we have the position even after the expression is reduced to a variable.

### Approach: Use the Core.Term position inline (non-breaking)

For Bin operations, capture positions from the original Core subexpressions:

```haskell
trans (Core.Bin op e1 e2 pos) context = do
  x <- freshV
  kterm <- context x
  let pos1 = posInfo e1  -- Position of first operand expression
      pos2 = posInfo e2  -- Position of second operand expression
  trans e1 (\z1 ->
    trans e2 (\z2 ->
      return $ LetSimple x (CPS.Bin op z1 z2 pos1 pos2 pos) kterm pos))
```

This works because we capture `posInfo e1` before calling `trans e1`.

## Files to Modify

- `compiler/src/RetDFCPS.hs`

## Changes

### 1. Update trans for Bin operations

```haskell
trans (Core.Bin op e1 e2 pos) context = do
  x <- freshV
  kterm <- context x
  -- Capture operand positions BEFORE transforming
  let pos1 = posInfo e1
      pos2 = posInfo e2
  trans e1 (\z1 ->
    trans e2 (\z2 ->
      return $ LetSimple x (CPS.Bin op z1 z2 pos1 pos2 pos) kterm pos))
```

### 2. Update transExplicit for Bin operations

```haskell
transExplicit (Core.Bin op e1 e2 pos) = do
  x <- freshV
  let pos1 = posInfo e1
      pos2 = posInfo e2
  trans e1 (\x1 ->
    trans e2 (\x2 ->
      return $ LetSimple x (CPS.Bin op x1 x2 pos1 pos2 pos) (KontReturn x pos) pos))
```

### 3. Update Un operations similarly

```haskell
trans (Core.Un op e pos) context = do
  x <- freshV
  kterm <- context x
  let opPos = posInfo e
  trans e (\z -> return $ LetSimple x (CPS.Un op z opPos pos) kterm pos)
```

### 4. Update ProjField and ProjIdx

```haskell
trans (Core.ProjField t f pos) context = do
  x <- freshV
  kterm <- context x
  let recPos = posInfo t
      -- Field doesn't have its own position in Core, use NoPos
      fieldPos = NoPos
  trans t (\z -> return $ LetSimple x (CPS.ProjField z f recPos fieldPos pos) kterm pos)

trans (Core.ProjIdx t idx pos) context = do
  x <- freshV
  kterm <- context x
  let tuplePos = posInfo t
  trans t (\z -> return $ LetSimple x (CPS.ProjIdx z idx tuplePos pos) kterm pos)
```

## What Changes

- Operand positions in CPS SimpleTerm now contain actual source positions
- Source maps will show precise operand locations

## What Does NOT Change

- trans function signature (still takes `VarName -> S KTerm`)
- Pattern matches in other modules (they already handle the new position fields from Phase 13g)

## Testing

```bash
make all && ./bin/golden --quick
```

All tests should pass.

## Verification

```bash
bin/troupec --source-map tests/rt/pos/core/fib10.trp -o /tmp/fib10.js
npx ts-node rt/src/tools/inspect-sourcemap.ts /tmp/fib10.js.map
```

Now we should see distinct positions for different operands in the same expression.

## Success Criteria

For source code like:
```
let x = a - b
```

The source map should include:
- Mapping for `a` pointing to column of `a`
- Mapping for `b` pointing to column of `b`
- Mapping for the whole expression

## Next Phase

Phase 13i: Clean up and optimize (remove unnecessary fallbacks, etc.).
