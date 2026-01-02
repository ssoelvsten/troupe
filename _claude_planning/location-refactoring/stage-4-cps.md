# Stage 4: CPS Representation

**Status**: Not started
**Depends on**: Stage 3 complete
**Fresh context**: Yes - start a new Claude Code session for this stage

## Goal

Migrate the CPS representation to use `Located` wrappers and update RetDFCPS to produce `Located` CPS terms (removing the temporary adapter from Stage 3). Add a temporary adapter in ClosureConv to maintain compatibility with IR.

## Files to Modify

- `compiler/src/RetCPS.hs` - CPS type definitions
- `compiler/src/RetDFCPS.hs` - Remove adapter, produce Located CPS terms

## Files to Add Adapter

- `compiler/src/ClosureConv.hs` - Temporary adapter to extract positions for old-style IR

## Implementation

### 1. Update RetCPS.hs

#### Add Imports and Pragmas

```haskell
{-# LANGUAGE PatternSynonyms #-}

import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, PosInf(..), GetPosInfo(..))
```

#### Define Located Type Aliases

```haskell
type LKTerm = Located KTerm
type LSimpleTerm = Located SimpleTerm
type LFunDef = Located FunDef
```

#### Transform KTerm Data Type

**Before:**
```haskell
data KTerm
    = LetSimple VarName SimpleTerm KTerm PosInf
    | LetRet VarName KTerm KTerm PosInf
    | LetFun [FunDef] KTerm PosInf
    | ApplyFun VarName VarName PosInf
    | If VarName KTerm KTerm PosInf
    | AssertElseError VarName KTerm VarName PosInf
    | Error VarName PosInf
    | KontReturn VarName PosInf
    | Halt VarName PosInf
```

**After:**
```haskell
data KTerm
    = LetSimple VarName LSimpleTerm LKTerm
    | LetRet VarName LKTerm LKTerm
    | LetFun [FunDef] LKTerm
    | ApplyFun VarName VarName
    | If VarName LKTerm LKTerm
    | AssertElseError VarName LKTerm VarName
    | Error VarName
    | KontReturn VarName
    | Halt VarName
```

#### Transform SimpleTerm Data Type

**Before:**
```haskell
data SimpleTerm
    = ValSimpleTerm Val PosInf
    | Bin BinOp VarName VarName PosInf
    | Un UnaryOp VarName PosInf
    | Tuple [VarName] PosInf
    | Record [(FieldName, VarName)] PosInf
    | WithRecord VarName [(FieldName, VarName)] PosInf
    | ProjField VarName FieldName PosInf
    | ProjIdx VarName Int PosInf
    | List [VarName] PosInf
    | ListCons VarName VarName PosInf
    | Base String
    | Lib String String
```

**After:**
```haskell
data SimpleTerm
    = ValSimpleTerm Val
    | Bin BinOp VarName VarName
    | Un UnaryOp VarName
    | Tuple [VarName]
    | Record [(FieldName, VarName)]
    | WithRecord VarName [(FieldName, VarName)]
    | ProjField VarName FieldName
    | ProjIdx VarName Int
    | List [VarName]
    | ListCons VarName VarName
    | Base String
    | Lib String String
```

#### Update FunDef and KLambda

```haskell
-- Before
data FunDef = Fun VarName KLambda PosInf

data KLambda
    = Unary VarName PosInf KTerm
    | Nullary KTerm

-- After
data FunDef = Fun VarName KLambda  -- position is on the Located wrapper

data KLambda
    = Unary VarName PosInf LKTerm  -- Keep argument position
    | Nullary LKTerm
```

#### Add Pattern Synonyms (Optional)

```haskell
pattern LetSimple' :: VarName -> LSimpleTerm -> LKTerm -> LKTerm
pattern LetSimple' v st kt <- Loc _ (LetSimple v st kt)

pattern KontReturn' :: VarName -> LKTerm
pattern KontReturn' v <- Loc _ (KontReturn v)

pattern ApplyFun' :: VarName -> VarName -> LKTerm
pattern ApplyFun' f x <- Loc _ (ApplyFun f x)

-- etc.
```

#### Remove Old GetPosInfo Instance

#### Update Exports

```haskell
, LKTerm
, LSimpleTerm
, LFunDef
```

### 2. Update RetDFCPS.hs

Remove the temporary adapter from Stage 3 and produce proper `Located` CPS terms.

#### Update Type Signatures

```haskell
transExplicit :: Core.LTerm -> S CPS.LKTerm
trans :: Core.LTerm -> (VarName -> S CPS.LKTerm) -> S CPS.LKTerm
transFunDecl :: Core.FunDecl -> S CPS.FunDef
```

#### Update transExplicit

**Before (adapter from Stage 3):**
```haskell
transExplicit :: Core.LTerm -> S CPS.KTerm
transExplicit (Loc pos (Core.Var (Core.RegVar x))) = return $ KontReturn (VN x) pos
```

**After (proper Located output):**
```haskell
transExplicit :: Core.LTerm -> S CPS.LKTerm
transExplicit (Loc pos (Core.Var (Core.RegVar x))) = return $ Loc pos (KontReturn (VN x))
transExplicit (Loc pos (Core.App e1 e2)) = do
  trans e1 (\x1 ->
    trans e2 (\x2 ->
      return $ Loc pos (ApplyFun x1 x2)))
transExplicit (Loc pos (Core.Lit lit)) = do
  x <- freshV
  return $ Loc pos (LetSimple x (Loc (posInfo lit) (ValSimpleTerm (CPS.Lit lit))) (Loc pos (KontReturn x)))
-- etc.
```

### 3. Add Temporary Adapter in ClosureConv.hs

ClosureConv transforms CPS to IR. Until IR is migrated, we need to extract positions from `Located` CPS terms.

#### Update Imports

```haskell
import TroupePositionInfo (Located(..), getLoc, unLoc, PosInf(..))
import qualified RetCPS as CPS
```

#### Update Translation Functions

**Before:**
```haskell
transKTerm :: CPS.KTerm -> ...
transKTerm (CPS.LetSimple v st kt pos) = ...
transKTerm (CPS.ApplyFun f x pos) = ...
```

**After (adapter pattern):**
```haskell
transKTerm :: CPS.LKTerm -> ...
transKTerm (Loc pos (CPS.LetSimple v st kt)) = ...  -- extract pos, embed in old IR
transKTerm (Loc pos (CPS.ApplyFun f x)) = ...
```

## Verification

```bash
make all && ./bin/golden --quick
```

All tests must pass. The adapter in ClosureConv ensures that IR output is identical to before.

## Commit Message

```
refactor(compiler): migrate CPS representation to Located wrappers

- Update RetCPS.hs: remove embedded PosInf from KTerm, SimpleTerm
- Update RetDFCPS.hs: produce Located CPS terms (remove Stage 3 adapter)
- Add temporary adapter in ClosureConv.hs to maintain IR compatibility

The adapter extracts positions from Located CPS and embeds them in
old-style IR constructors. This will be removed when IR is migrated
in Stage 5.
```

## Next Stage

After committing, update [handoff.md](handoff.md) and proceed to Stage 5 in a fresh context.
