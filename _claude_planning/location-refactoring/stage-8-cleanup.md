# Stage 8: Final Cleanup

**Status**: Not started
**Depends on**: Stage 7 complete
**Fresh context**: Yes - start a new Claude Code session for this stage

## Goal

Remove all vestiges of the old position-embedding approach:
- Delete unused `GetPosInfo` instances
- Remove any dead code or temporary compatibility shims
- Clean up imports
- Add any missing pattern synonyms for convenience

## Files to Review

All files modified in previous stages:

- `compiler/src/TroupePositionInfo.hs`
- `compiler/src/Direct.hs`
- `compiler/src/Parser.y`
- `compiler/src/Core.hs`
- `compiler/src/DirectWOPats.hs`
- `compiler/src/RetCPS.hs`
- `compiler/src/RetDFCPS.hs`
- `compiler/src/IR.hs`
- `compiler/src/ClosureConv.hs`
- `compiler/src/Raw.hs`
- `compiler/src/IR2Raw.hs`
- `compiler/src/Stack.hs`
- `compiler/src/Raw2Stack.hs`
- `compiler/src/Stack2JS.hs`
- `compiler/src/TroupeSourceMap.hs`

## Cleanup Tasks

### 1. Remove Unused GetPosInfo Instances

Search for `GetPosInfo` instances that are no longer needed:

```bash
grep -n "instance GetPosInfo" compiler/src/*.hs
```

The following should remain:
- `GetPosInfo PosInf` (identity)
- `GetPosInfo (Located a)` (the new generic instance)
- `GetPosInfo Lit` (if literals still have internal positions)

Remove instances for:
- `Term` (in Direct, Core)
- `DeclPattern` (in Direct)
- `KTerm`, `SimpleTerm` (in RetCPS)
- `IRInst`, `IRTerminator`, `FunDef` (in IR)
- `RawInst`, `RawTerminator` (in Raw)
- `StackInst`, `StackTerminator` (in Stack)

### 2. Remove Dead Helper Functions

Look for any helper functions that were only used with the old position-embedding approach.

### 3. Clean Up Imports

Remove unused imports in each file. Common candidates:
- Imports of `PosInf` constructor that are no longer pattern-matched
- Imports of old helper functions

### 4. Verify Pattern Synonyms Are Complete

For each AST type, ensure pattern synonyms exist for common use cases:

```haskell
-- Example completeness check for Core
pattern Var' :: VarAccess -> LTerm
pattern App' :: LTerm -> LTerm -> LTerm
pattern Lit' :: Lit -> LTerm
pattern If' :: LTerm -> LTerm -> LTerm -> LTerm
pattern Let' :: Decl -> LTerm -> LTerm
-- etc. for all constructors that are frequently pattern-matched
```

### 5. Update Documentation Comments

Add or update documentation for:
- `Located` type and its purpose
- Pattern synonyms and when to use them
- Guidelines for working with positions in new code

### 6. Verify No Regressions

Run comprehensive tests:

```bash
# Full build
make all

# Full test suite
make test

# Compile various test files to check for edge cases
bin/troupec tests/rt/pos/core/simple.trp -o /tmp/t1.js
bin/troupec tests/rt/pos/ifc/basic.trp -o /tmp/t2.js
bin/troupec lib/Lists.trp -o /tmp/t3.js

# Verify source maps
for f in /tmp/t1.js /tmp/t2.js /tmp/t3.js; do
    if [ -f "$f.map" ]; then echo "OK: $f.map exists"; fi
done
```

## Verification

```bash
make all && make test
```

All tests must pass.

### Code Quality Checks

```bash
# Check for unused imports (if hlint is available)
hlint compiler/src/

# Check for any remaining old-style position parameters
grep -n "PosInf$" compiler/src/*.hs  # Should find minimal matches
```

## Commit Message

```
refactor(compiler): complete Located wrapper migration cleanup

- Remove unused GetPosInfo instances for old AST types
- Clean up unused imports and dead code
- Verify pattern synonyms are complete and documented
- Final verification of source map correctness

The Located wrapper migration is now complete. All AST types use
Located wrappers for position information, simplifying transformations
and reducing boilerplate.
```

## Summary

After this stage, the migration is complete:

| Before | After |
|--------|-------|
| `PosInf` embedded in every constructor | `Located a` wrapper |
| 17+ patterns per `GetPosInfo` instance | Single generic instance |
| Manual position threading | `fmap` over `Located` |
| Inconsistent position handling | Uniform `getLoc`/`atLoc` API |

## Future Work

Consider these improvements after the migration settles:

1. **Span positions**: Extend `PosInf` to include end position for better error messages
2. **Position-preserving transformations**: Use `mapLoc` for transformations that preserve positions
3. **Better error messages**: Use positions consistently in all error paths
