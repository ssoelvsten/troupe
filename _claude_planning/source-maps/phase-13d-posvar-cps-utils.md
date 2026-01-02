# Phase 13d: Emit Operand Markers in Stack2JS

## Goal

Update `Stack2JS.hs` to emit source map markers for operand positions when present (i.e., when not `NoPos`).

## Approach

The `emitMarker` function already exists from Phase 12. We extend its usage to operand positions.

## Files to Modify

- `compiler/src/Stack2JS.hs`

## Changes

### 1. Add helper for conditional marker emission

```haskell
-- | Emit a source map marker only if position is real (not NoPos)
emitMarkerIfPos :: PosInf -> W PP.Doc
emitMarkerIfPos NoPos = return PP.empty
emitMarkerIfPos pos = emitMarker pos
```

### 2. Update RawExpr rendering to emit operand markers

```haskell
-- In ir2js or wherever RawExpr is rendered:

rawExpr2js :: Raw.RawExpr -> W PP.Doc
rawExpr2js (Raw.Bin op _ rv1 rv2 pos1 pos2) = do
  marker1 <- emitMarkerIfPos pos1
  marker2 <- emitMarkerIfPos pos2
  let v1Doc = ppRawVar rv1
      v2Doc = ppRawVar rv2
      opDoc = ppBinOp op
  return $ marker1 PP.<> v1Doc <+> opDoc <+> marker2 PP.<> v2Doc

rawExpr2js (Raw.Un op rv pos) = do
  marker <- emitMarkerIfPos pos
  let vDoc = ppRawVar rv
      opDoc = ppUnaryOp op
  return $ opDoc <+> marker PP.<> vDoc

rawExpr2js (Raw.ProjField rv fname recPos fieldPos) = do
  markerRec <- emitMarkerIfPos recPos
  markerField <- emitMarkerIfPos fieldPos
  let vDoc = ppRawVar rv
      fDoc = PP.text fname
  return $ markerRec PP.<> vDoc PP.<> PP.text "." PP.<> markerField PP.<> fDoc
```

## What Does NOT Change

- Source map generation logic (already works from Phase 12)
- Marker stripping and mapping collection (already works)
- All other JS generation code

## Testing

```bash
make all && ./bin/golden --quick
```

Both must pass. Since all positions are currently `NoPos`, output is identical to before.

## Verification

At this point, the infrastructure is ready but no operand positions are being captured yet. To verify:

1. Compile a test file with source maps:
   ```bash
   bin/troupec --source-map tests/rt/pos/core/fib10.trp -o /tmp/fib10.js
   ```

2. Check the source map:
   ```bash
   npx ts-node rt/src/tools/inspect-sourcemap.ts /tmp/fib10.js.map
   ```

3. The output should show the same mappings as before (if/then/else positions from Phase 12).

## Next Phase

Phase 13e: Add operand positions to IR layer.
