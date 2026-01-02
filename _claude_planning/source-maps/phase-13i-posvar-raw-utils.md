# Phase 13i: Cleanup and Verification

## Goal

Clean up the implementation, verify source maps are correct, and ensure all edge cases are handled.

## Tasks

### 1. Verify position flow through the pipeline

Create a test that verifies positions flow correctly:

```bash
# Create a test file with known positions
cat > /tmp/test_positions.trp << 'EOF'
let x = 10
let y = 20
let z = x + y
z
EOF

# Compile with source map
bin/troupec --source-map /tmp/test_positions.trp -o /tmp/test_positions.js

# Inspect the source map
npx ts-node rt/src/tools/inspect-sourcemap.ts /tmp/test_positions.js.map
```

Expected: Mappings for variables `x`, `y` in the expression `x + y`.

### 2. Handle edge cases

Ensure proper handling of:
- Nested binary expressions: `a + b * c`
- Unary expressions: `not x`
- Field projections: `record.field`
- Tuple projections: `tuple.0`
- Variables defined via let: `let x = 1 in x`

### 3. Consider removing fallbacks

In ClosureConv.hs, the fallback to statement position can be simplified once we're confident operand positions are always present:

```haskell
-- With fallback (Phase 13g):
let pos1 = posOrFallback opPos1 stPos

-- Without fallback (if we're confident operand positions are always present):
let pos1 = opPos1
```

Only remove fallbacks after verifying positions are always available.

### 4. Audit pretty printers

Ensure all pretty printers correctly ignore the new position fields:

```haskell
-- RetCPS.hs
ppSimpleTerm (Bin op (VN v1) (VN v2) _ _ _) = ...

-- IR.hs
ppIRExpr (Bin op v1 v2 _ _) = ...

-- Raw.hs
ppRawExpr (Bin op _ rv1 rv2 _ _) = ...
```

### 5. Audit serialization

If any of the modified types use `Serialize`, ensure the instances are updated or derived correctly.

## Files to Review

- `compiler/src/RetCPS.hs` - SimpleTerm, pretty printer
- `compiler/src/IR.hs` - IRExpr, pretty printer
- `compiler/src/Raw.hs` - RawExpr, pretty printer
- `compiler/src/Stack2JS.hs` - marker emission

## Testing

```bash
make all && make test
bin/golden
```

All tests must pass.

## Verification Checklist

- [ ] Binary expressions have operand positions
- [ ] Unary expressions have operand positions
- [ ] Field projections have record positions
- [ ] Tuple projections have tuple positions
- [ ] Positions survive through optimizations (CPSOpt, IROpt, RawOpt)
- [ ] Source maps decode correctly
- [ ] Pretty printers work correctly

## Next Phase

Phase 13j: Documentation and handoff.
