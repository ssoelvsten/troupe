# Stage 7: Code Generation + Source Maps

**Status**: Not started
**Depends on**: Stage 6 complete
**Fresh context**: Yes - start a new Claude Code session for this stage

## Goal

Finalize code generation to work cleanly with `Located` wrappers. This stage removes the temporary adapter from Stage 6 and ensures source maps are correctly generated from `Located` values.

## Files to Modify

- `compiler/src/Stack2JS.hs` - Clean up position extraction
- `compiler/src/TroupeSourceMap.hs` - Ensure compatibility with Located

## Implementation

### 1. Clean Up Stack2JS.hs

The "adapter" from Stage 6 was simply using `getLoc` to extract positions. In this stage, we make this the standard pattern throughout the file.

#### Consistent Pattern for Instruction Generation

```haskell
genInst :: LStackInst -> JSGen ()
genInst (Loc pos inst) = withSourcePos pos $ case inst of
    SAssign v e -> do
        emitJS $ genAssign v e
    SPush v -> do
        emitJS $ genPush v
    -- etc.
```

Or if there's no `withSourcePos` helper:

```haskell
genInst :: LStackInst -> JSGen ()
genInst linst = do
    let pos = getLoc linst
    recordMapping pos  -- for source map
    case unLoc linst of
        SAssign v e -> emitJS $ genAssign v e
        -- etc.
```

#### Pattern for Terminators

```haskell
genTerminator :: LStackTerminator -> JSGen ()
genTerminator (Loc pos term) = withSourcePos pos $ case term of
    SRet v -> emitJS $ genReturn v
    STailCall f x -> emitJS $ genTailCall f x
    -- etc.
```

### 2. Update TroupeSourceMap.hs

The source map module should work naturally with `Located` values.

#### Ensure collectMapping Works with Located

If `collectMapping` currently takes `PosInf` directly:
```haskell
collectMapping :: PosInf -> Int -> Int -> Maybe Mapping
```

This is fine - callers just use `getLoc` to extract the position:
```haskell
collectMapping (getLoc linst) generatedLine generatedCol
```

#### Optional: Add Located-Aware Helper

```haskell
-- Convenience function for Located values
collectMappingL :: Located a -> Int -> Int -> Maybe Mapping
collectMappingL located = collectMapping (getLoc located)
```

### 3. Verify Source Map Correctness

This is the critical verification for this stage.

#### Test Source Map Generation

```bash
# Compile a test file with source maps
bin/troupec tests/rt/pos/core/simple.trp -v -o /tmp/test.js

# Check source map exists
ls -la /tmp/test.js.map

# Inspect source map content
cat /tmp/test.js.map | python3 -m json.tool | head -50
```

#### Verify Mappings Point to Correct Locations

The source map should contain:
- `sources`: list of source files
- `mappings`: VLQ-encoded position mappings
- Lines in generated JS should map back to correct Troupe source lines

#### Manual Verification

1. Pick a line in the generated JS (e.g., a function call)
2. Decode its source map entry
3. Verify it points to the correct line in the `.trp` source

### 4. Test with Browser DevTools (Optional)

If you have a way to run Troupe in a browser context:
1. Open DevTools
2. Load the generated JS with source map
3. Verify you can set breakpoints in the original `.trp` source
4. Verify stack traces show `.trp` file locations

## Verification

```bash
make all && ./bin/golden --quick
```

All tests must pass.

### Additional Source Map Tests

```bash
# Compile multiple test files and check source maps
for f in tests/rt/pos/core/simple.trp tests/rt/pos/core/functions.trp; do
    bin/troupec "$f" -v -o /tmp/out.js
    if [ -f /tmp/out.js.map ]; then
        echo "OK: $f has source map"
    else
        echo "FAIL: $f missing source map"
    fi
done
```

## Commit Message

```
refactor(compiler): finalize Located wrapper usage in code generation

- Clean up Stack2JS.hs to consistently use getLoc for position extraction
- Verify source map generation works correctly with Located values
- Complete the Located wrapper migration for the full compilation pipeline

All positions now flow through Located wrappers from parser to codegen.
Source maps are generated correctly from Located position information.
```

## Next Stage

After committing, update [handoff.md](handoff.md) and proceed to Stage 8 (Cleanup) in a fresh context.
