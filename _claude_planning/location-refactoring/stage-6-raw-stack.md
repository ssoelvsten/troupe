# Stage 6: Raw + Stack Representations

**Status**: Not started
**Depends on**: Stage 5 complete
**Fresh context**: Yes - start a new Claude Code session for this stage

## Goal

Migrate Raw and Stack representations to use `Located` wrappers. Update IR2Raw and Raw2Stack to produce `Located` output (removing the temporary adapter from Stage 5). Add a temporary adapter in Stack2JS to maintain compatibility with code generation.

## Files to Modify

- `compiler/src/Raw.hs` - Raw type definitions
- `compiler/src/IR2Raw.hs` - Remove adapter, produce Located Raw
- `compiler/src/Stack.hs` - Stack type definitions
- `compiler/src/Raw2Stack.hs` - Produce Located Stack

## Files to Add Adapter

- `compiler/src/Stack2JS.hs` - Temporary adapter to extract positions for code generation

## Implementation

### 1. Update Raw.hs

#### Add Imports

```haskell
import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, PosInf(..), GetPosInfo(..))
```

#### Define Located Type Aliases

```haskell
type LRawInst = Located RawInst
type LRawTerminator = Located RawTerminator
```

#### Transform RawInst Data Type

**Before:**
```haskell
data RawInst
    = AssignRaw RawVar RawExpr PosInf
    | AssignLVal VarName RawExpr PosInf
    | SetState MonComponent RawVar PosInf
    | SetBranchFlag PosInf
    | RawRuntimeCall String [(RawVar, RawVar, RawVar)] PosInf
    | RawAssertLbl RawVar RawVar PosInf
    | ... -- many more
```

**After:**
```haskell
data RawInst
    = AssignRaw RawVar RawExpr
    | AssignLVal VarName RawExpr
    | SetState MonComponent RawVar
    | SetBranchFlag
    | RawRuntimeCall String [(RawVar, RawVar, RawVar)]
    | RawAssertLbl RawVar RawVar
    | ... -- same, without PosInf
```

#### Transform RawTerminator

**Before:**
```haskell
data RawTerminator
    = TailCall RawVar RawVar RawVar RawVar PosInf
    | Ret RawVar RawVar PosInf
    | If RawVar BBId BBId PosInf
    | Error RawVar PosInf
    | Halt RawVar RawVar PosInf
    | LibExport RawVar PosInf
```

**After:**
```haskell
data RawTerminator
    = TailCall RawVar RawVar RawVar RawVar
    | Ret RawVar RawVar
    | If RawVar BBId BBId
    | Error RawVar
    | Halt RawVar RawVar
    | LibExport RawVar
```

#### Update RawBB

```haskell
-- Before
data RawBB = RawBB [RawInst] RawTerminator

-- After
data RawBB = RawBB [LRawInst] LRawTerminator
```

### 2. Update IR2Raw.hs

Remove the adapter from Stage 5. The reader monad approach can be simplified or kept.

#### Simplify Position Handling

**Option A: Remove reader monad, use Located directly**

```haskell
-- Before
type TM = RWS PosInf [RawInst] Int

-- After
type TM = RWS () [LRawInst] Int
-- Or just State Int with explicit list building
```

**Option B: Keep reader for convenience, produce Located**

```haskell
assignRExpr :: PosInf -> RawExpr -> TM RawVar
assignRExpr pos e = do
    r <- freshRawVar
    tell [L pos (AssignRaw r e)]
    return r
```

#### Update Translation Functions

```haskell
-- Extract position from Located IR, wrap in Located Raw
transInst :: IR.LIRInst -> TM ()
transInst (L pos (IR.Assign v e)) = do
    rcomp <- expr2RawComp e
    ... tell [L pos (AssignRaw r expr)] ...
```

### 3. Update Stack.hs

#### Add Imports

```haskell
import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, PosInf(..), GetPosInfo(..))
```

#### Define Located Type Aliases

```haskell
type LStackInst = Located StackInst
type LStackTerminator = Located StackTerminator
```

#### Transform StackInst Data Type

Similar to Raw - remove `PosInf` from all constructors.

**Before:**
```haskell
data StackInst
    = SAssign StackVar StackExpr PosInf
    | SPush StackVar PosInf
    | SPop StackVar PosInf
    | ... -- with PosInf
```

**After:**
```haskell
data StackInst
    = SAssign StackVar StackExpr
    | SPush StackVar
    | SPop StackVar
    | ... -- without PosInf
```

#### Transform StackTerminator Similarly

### 4. Update Raw2Stack.hs

Produce `Located` Stack from `Located` Raw.

```haskell
transInst :: LRawInst -> [LStackInst]
transInst (L pos (AssignRaw v e)) = [L pos (SAssign (toStackVar v) (transExpr e))]
-- etc.
```

### 5. Add Temporary Adapter in Stack2JS.hs

Stack2JS generates JavaScript code. It needs positions for source maps.

#### Update to Extract from Located

```haskell
genInst :: LStackInst -> JSGen ()
genInst (L pos inst) = do
    recordSourceMapping pos
    case inst of
        SAssign v e -> ...
        SPush v -> ...
        -- etc.
```

Or using pattern matching:

```haskell
genInst :: LStackInst -> JSGen ()
genInst linst = do
    recordSourceMapping (getLoc linst)
    case unLoc linst of
        SAssign v e -> ...
```

The adapter is simply extracting `pos` with `getLoc` for source map generation.

## Verification

```bash
make all && make test
```

All tests must pass.

### Additional Verification: Source Maps

Since this stage is close to code generation, verify source maps still work:

```bash
bin/troupec tests/rt/pos/core/simple.trp -v -o /tmp/test.js
ls -la /tmp/test.js.map  # Should exist
head -20 /tmp/test.js.map  # Should contain valid mappings
```

## Commit Message

```
refactor(compiler): migrate Raw and Stack to Located wrappers

- Update Raw.hs: remove embedded PosInf from RawInst, RawTerminator
- Update IR2Raw.hs: produce Located Raw (remove Stage 5 adapter)
- Update Stack.hs: remove embedded PosInf from StackInst, StackTerminator
- Update Raw2Stack.hs: produce Located Stack
- Add temporary adapter in Stack2JS.hs to extract positions for codegen

The adapter uses getLoc to extract positions for source map generation.
This will be finalized in Stage 7.
```

## Next Stage

After committing, update [handoff.md](handoff.md) and proceed to Stage 7 in a fresh context.
