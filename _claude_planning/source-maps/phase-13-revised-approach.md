# Phase 13: Revised Approach for Operand Position Threading

## The Problem with the Original Plan

The original phases 13a-13j proposed changing type definitions (e.g., `SimpleTerm` constructors from `VarName` to `PosVar`) which would immediately break all modules that pattern-match on those types.

For example, changing:
```haskell
data SimpleTerm = Bin BinOp VarName VarName PosInf | ...
```
to:
```haskell
data SimpleTerm = Bin BinOp PosVar PosVar PosInf | ...
```

Would break: RetDFCPS.hs, CPSOpt.hs, ClosureConv.hs, RetRewrite.hs, RetFreeVars.hs - all at once.

## The Solution: Backward Propagation with Additive Position Fields

Instead of changing core type definitions, we:

1. **Add new position fields to types** (defaulting to `NoPos`)
2. **Work backwards from Stack2JS** (where we emit source maps)
3. **Gradually enable position capture** at each layer

This way:
- Each phase compiles and tests pass
- Positions are captured incrementally
- No breaking changes to existing pattern matches

### Why PosInf instead of Maybe PosInf?

The `PosInf` type already has a `NoPos` constructor, so wrapping it in `Maybe` is redundant:
- `Nothing` = no position
- `Just NoPos` = also no position (redundant!)
- `Just (SrcPosInf ...)` = has position

We use plain `PosInf` with `NoPos` as the default "no position" value.

## Revised Phase Structure

### Phase 13a: Add PosVar/PosField helper types (INFRASTRUCTURE ONLY)

Add to `RetCPS.hs`:
- `PosVar`, `PosField` newtypes
- Helper functions for conversion
- **Do NOT change existing type definitions**

Result: Compiler builds, tests pass, no behavior change.

### Phase 13b: Add helper function for position fallback

Add to `RetDFCPS.hs`:
```haskell
posOrFallback :: PosInf -> PosInf -> PosInf
posOrFallback NoPos fallback = fallback
posOrFallback pos _ = pos
```

Result: Compiler builds, tests pass, no behavior change.

### Phase 13c: Add operand positions to Raw layer

Add position fields to `Raw.hs`:

```haskell
data RawExpr
  = Bin Basics.BinOp UseNativeBinop RawVar RawVar PosInf PosInf
  --                                op1    op2    op1Pos op2Pos
  | Un Basics.UnaryOp RawVar PosInf
  | ...
```

Update `IR2Raw.hs` to pass `NoPos` for new fields.
Update `RawOpt.hs`, `Raw2Stack.hs` to preserve positions.

Result: Compiler builds, tests pass, positions flow through (but are all `NoPos`).

### Phase 13d: Emit operand positions in Stack2JS

Update `Stack2JS.hs` to emit source map markers when position is not `NoPos`:

```haskell
emitMarkerIfPos :: PosInf -> W PP.Doc
emitMarkerIfPos NoPos = return PP.empty
emitMarkerIfPos pos = emitMarker pos
```

Result: Compiler builds, tests pass, source maps would include operand positions IF they were present.

### Phase 13e: Add operand positions to IR layer

Same pattern for `IR.hs`:

```haskell
data IRExpr
  = Bin Basics.BinOp VarAccess VarAccess PosInf PosInf
  --                 operand1  operand2  op1Pos op2Pos
  | Un Basics.UnaryOp VarAccess PosInf
  | ...
```

Update `ClosureConv.hs` to pass `NoPos` for new fields.
Update `IROpt.hs`, `IR2Raw.hs` to preserve positions.

Result: Compiler builds, tests pass, no behavior change (all positions are `NoPos`).

### Phase 13f: Capture statement positions as operand positions

Update `ClosureConv.hs` to use statement position as initial operand position:

```haskell
cpsToIR (LetSimple x (CPS.Bin op v1 v2 stPos) kterm _) = do
  -- For now, use the statement position for both operands
  let pos1 = stPos
      pos2 = stPos
  tell [Assign x (IR.Bin op va1 va2 pos1 pos2) stPos]
```

Result: Compiler builds, tests pass, source maps now include some operand positions!

### Phase 13g: Add operand positions to CPS layer

Add position fields to `SimpleTerm`:

```haskell
data SimpleTerm
  = Bin BinOp VarName VarName PosInf PosInf PosInf
  --          op1     op2     op1Pos op2Pos stmtPos
  | Un UnaryOp VarName PosInf PosInf
  | ...
```

Update all consumers (CPSOpt, ClosureConv, RetRewrite, RetFreeVars) to preserve positions.
Update `RetDFCPS.hs` to pass `NoPos` for new fields.

### Phase 13h: Capture actual operand positions in RetDFCPS

Capture the actual operand positions from Core expressions:

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

Update `ClosureConv.hs` to use per-operand positions with fallback:

```haskell
let pos1 = posOrFallback opPos1 stPos
    pos2 = posOrFallback opPos2 stPos
```

### Phase 13i: Cleanup and verification

- Verify positions flow correctly through all stages
- Audit pretty printers and serialization
- Consider removing fallbacks once confident all positions are present

### Phase 13j: Documentation and summary

- Document all changes made
- Update position flow diagram
- Prepare for Phase 14 (runtime resolver)

## Implementation Order

| Phase | Files                                             | Change                                    | Breaks Others? |
|-------|---------------------------------------------------|-------------------------------------------|----------------|
| 13a   | RetCPS.hs                                         | Add PosVar/PosField types (unused)        | No             |
| 13b   | RetDFCPS.hs                                       | Add posOrFallback helper                  | No             |
| 13c   | Raw.hs, RawOpt.hs, Raw2Stack.hs, IR2Raw.hs        | Add PosInf fields to RawExpr              | No             |
| 13d   | Stack2JS.hs                                       | Emit markers for positions                | No             |
| 13e   | IR.hs, IROpt.hs, ClosureConv.hs, IR2Raw.hs        | Add PosInf fields to IRExpr               | No             |
| 13f   | ClosureConv.hs                                    | Capture statement positions as operand pos| No             |
| 13g   | RetCPS.hs, CPSOpt.hs, ClosureConv.hs, etc.        | Add PosInf fields to SimpleTerm           | No             |
| 13h   | RetDFCPS.hs                                       | Capture Core expression positions         | No             |
| 13i   | Various                                           | Cleanup and verification                  | No             |
| 13j   | Documentation                                     | Summary and handoff                       | No             |

## Success Criteria

After all phases:
1. `make all && make test` passes at each phase
2. Source maps include operand-level mappings for expressions like `x - 1`
3. Runtime can report precise error locations for operands
