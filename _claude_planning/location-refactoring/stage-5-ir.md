# Stage 5: IR Representation

**Status**: Not started
**Depends on**: Stage 4 complete
**Fresh context**: Yes - start a new Claude Code session for this stage

## Goal

Migrate the IR representation to use `Located` wrappers and update ClosureConv to produce `Located` IR (removing the temporary adapter from Stage 4). Add a temporary adapter in IR2Raw to maintain compatibility with Raw.

## Special Consideration: FunDef Dual Positions

The current `FunDef` has **two** `PosInf` fields:
```haskell
data FunDef = FunDef HFN VarName PosInf Consts IRBBTree PosInf
--                          ^argument pos           ^function def pos
```

Decision: Consolidate to single `Located FunDef` for the function definition position. The argument position can be tracked separately if needed (likely in the variable binding).

## Files to Modify

- `compiler/src/IR.hs` - IR type definitions
- `compiler/src/ClosureConv.hs` - Remove adapter, produce Located IR

## Files to Add Adapter

- `compiler/src/IR2Raw.hs` - Temporary adapter to extract positions for old-style Raw

## Implementation

### 1. Update IR.hs

#### Add Imports and Pragmas

```haskell
{-# LANGUAGE PatternSynonyms #-}

import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, PosInf(..), GetPosInfo(..))
```

#### Define Located Type Aliases

```haskell
type LIRInst = Located IRInst
type LIRTerminator = Located IRTerminator
type LFunDef = Located FunDef
type LIRExpr = Located IRExpr
```

#### Transform IRInst Data Type

**Before:**
```haskell
data IRInst
    = Assign VarName IRExpr PosInf
    | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)] PosInf
```

**After:**
```haskell
data IRInst
    = Assign VarName IRExpr
    | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]
```

#### Transform IRTerminator Data Type

**Before:**
```haskell
data IRTerminator
    = TailCall VarAccess VarName PosInf
    | Ret VarName PosInf
    | If VarName BBId BBId PosInf
    | AssertElseError VarName BBId VarName PosInf
    | LibExport VarName PosInf
    | Error VarName PosInf
    | Halt VarName PosInf
```

**After:**
```haskell
data IRTerminator
    = TailCall VarAccess VarName
    | Ret VarName
    | If VarName BBId BBId
    | AssertElseError VarName BBId VarName
    | LibExport VarName
    | Error VarName
    | Halt VarName
```

#### Transform FunDef

**Before (two positions):**
```haskell
data FunDef = FunDef HFN VarName PosInf Consts IRBBTree PosInf
```

**After (one position on wrapper, keep argument position):**
```haskell
data FunDef = FunDef HFN VarName PosInf Consts IRBBTree
--                          ^argument position kept inline
-- Function definition position is on the Located wrapper
```

Or alternatively, use a record:
```haskell
data FunDef = FunDef
    { fdName :: HFN
    , fdArg :: VarName
    , fdArgPos :: PosInf  -- argument position
    , fdConsts :: Consts
    , fdBody :: IRBBTree
    }
```

#### Update IRBBTree

The basic block tree likely contains `[IRInst]` and `IRTerminator`. These should become `[LIRInst]` and `LIRTerminator`.

```haskell
data IRBB = IRBB [LIRInst] LIRTerminator
```

#### Add Pattern Synonyms (Optional)

```haskell
pattern Assign' :: VarName -> IRExpr -> LIRInst
pattern Assign' v e <- Loc _ (Assign v e)

pattern TailCall' :: VarAccess -> VarName -> LIRTerminator
pattern TailCall' f x <- Loc _ (TailCall f x)

pattern Ret' :: VarName -> LIRTerminator
pattern Ret' v <- Loc _ (Ret v)
```

#### Remove Old GetPosInfo Instances

#### Update Exports

```haskell
, LIRInst
, LIRTerminator
, LFunDef
, LIRExpr
```

### 2. Update ClosureConv.hs

Remove the temporary adapter from Stage 4 and produce proper `Located` IR.

#### Update Translation Functions

**Before (adapter from Stage 4):**
```haskell
transKTerm :: CPS.LKTerm -> ...
transKTerm (Loc pos (CPS.ApplyFun f x)) =
    ... TailCall (translateVar f) (translateVar x) pos ...
```

**After (proper Located output):**
```haskell
transKTerm :: CPS.LKTerm -> ...
transKTerm (Loc pos (CPS.ApplyFun f x)) =
    ... Loc pos (TailCall (translateVar f) (translateVar x)) ...
```

### 3. Add Temporary Adapter in IR2Raw.hs

IR2Raw currently uses a reader monad to track position:
```haskell
type TM = RWS PosInf [RawInst] Int
```

This can be simplified or kept, but the key change is extracting positions from `Located` IR input.

#### Update Imports

```haskell
import TroupePositionInfo (Located(..), getLoc, unLoc, PosInf(..))
import qualified IR
```

#### Update Translation Approach

**Option A: Keep reader monad, set from Located**
```haskell
transInst :: IR.LIRInst -> TM ()
transInst linst = withPos (getLoc linst) $ case unLoc linst of
    IR.Assign v e -> ...
    IR.MkFunClosures envs closures -> ...
```

**Option B: Extract directly, embed in old-style Raw**
```haskell
transInst :: IR.LIRInst -> TM ()
transInst (Loc pos (IR.Assign v e)) = do
    ... tell [AssignRaw r expr pos] ...  -- embed pos in old-style Raw
```

Either approach works. The adapter ensures Raw output is identical to before.

## Verification

```bash
make all && make test
```

All tests must pass. The adapter in IR2Raw ensures that Raw output is identical to before.

## Commit Message

```
refactor(compiler): migrate IR representation to Located wrappers

- Update IR.hs: remove embedded PosInf from IRInst, IRTerminator
- Consolidate FunDef from two positions to one (on Located wrapper)
- Update ClosureConv.hs: produce Located IR (remove Stage 4 adapter)
- Add temporary adapter in IR2Raw.hs to maintain Raw compatibility

The adapter extracts positions from Located IR and embeds them in
old-style Raw constructors. This will be removed when Raw is migrated
in Stage 6.
```

## Next Stage

After committing, update [handoff.md](handoff.md) and proceed to Stage 6 in a fresh context.
