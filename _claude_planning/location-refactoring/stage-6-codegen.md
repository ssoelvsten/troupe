# Stage 6: Code Generation

**Status**: Not started
**Depends on**: Stages 1-5 complete

## Overview

Update code generation to work with `Located` wrappers. This is the final stage.

## Files to Modify

- `compiler/src/Stack2JS.hs`
- `compiler/src/TroupeSourceMap.hs`

## Implementation

### 1. Update Stack2JS.hs

Extract positions using `getLoc` when generating JavaScript:

```haskell
-- Before
genInst (AssignRaw v e pos) = ...

-- After
genInst (L pos (AssignRaw v e)) = ...
-- or using pattern synonym:
genInst inst = let pos = getLoc inst in case unLoc inst of
    AssignRaw v e -> ...
```

### 2. Update TroupeSourceMap.hs

Source map collection should work with `Located` values:

```haskell
-- The collectMapping function already takes PosInf:
collectMapping :: PosInf -> Int -> Int -> Maybe Mapping

-- Just need to extract from Located where used:
collectMapping (getLoc locatedInst) genLine genCol
```

### 3. Verify Source Maps

After changes, verify source maps are still generated correctly:

1. Compile a test file with verbose output:
   ```bash
   bin/troupec tests/rt/pos/core/simple.trp -v -o out.js
   ```

2. Check that `.map` file is generated

3. Verify mappings point to correct source locations

## Verification

```bash
make compiler && make test
```

Additional verification:
```bash
# Compile with verbose to check source map
bin/troupec tests/rt/pos/core/simple.trp -v -o /tmp/test.js
cat /tmp/test.js.map | head -20
```

## Commit

```
refactor(compiler): complete Located wrapper migration in codegen
```

## Final Cleanup

After all stages complete:
- Remove any unused `GetPosInfo` instances
- Clean up any dead code
- Update any documentation

```
refactor(compiler): Located wrapper migration complete
```
