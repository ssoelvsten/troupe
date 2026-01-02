# Stage 3: DirectWOPats + Core AST

**Status**: Not started
**Depends on**: Stage 2 complete
**Fresh context**: Yes - start a new Claude Code session for this stage

## Goal

Migrate the Core AST to use `Located` wrappers and update DirectWOPats to produce `Located` Core terms (removing the temporary adapter from Stage 2). Add a temporary adapter in RetDFCPS to maintain compatibility with CPS.

## Files to Modify

- `compiler/src/Core.hs` - Core AST type definitions
- `compiler/src/DirectWOPats.hs` - Remove adapter, produce Located Core terms

## Files to Add Adapter

- `compiler/src/RetDFCPS.hs` - Temporary adapter to extract positions for old-style CPS

## Implementation

### 1. Update Core.hs

#### Add Imports and Pragmas

```haskell
{-# LANGUAGE PatternSynonyms #-}

import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, PosInf(..), GetPosInfo(..))
```

#### Define Located Type Aliases

```haskell
type LTerm = Located Term
type LDecl = Located Decl
```

#### Transform Term Data Type

**Before:**
```haskell
data Term
    = Var VarAccess PosInf
    | Abs Lambda PosInf
    | App Term Term PosInf
    | Let Decl Term PosInf
    | If Term Term Term PosInf
    | Lit Lit
    | Tuple [Term] PosInf
    | Record Fields PosInf
    | WithRecord Term Fields PosInf
    | ProjField Term FieldName PosInf
    | ProjIdx Term Int PosInf
    | List [Term] PosInf
    | ListCons Term Term PosInf
    | Bin BinOp Term Term PosInf
    | Un UnaryOp Term PosInf
    | AssertType Term Ty PosInf
    | Error Term PosInf
```

**After:**
```haskell
data Term
    = Var VarAccess
    | Abs Lambda
    | App LTerm LTerm
    | Let Decl LTerm
    | If LTerm LTerm LTerm
    | Lit Lit
    | Tuple [LTerm]
    | Record LFields
    | WithRecord LTerm LFields
    | ProjField LTerm FieldName
    | ProjIdx LTerm Int
    | List [LTerm]
    | ListCons LTerm LTerm
    | Bin BinOp LTerm LTerm
    | Un UnaryOp LTerm
    | AssertType LTerm Ty
    | Error LTerm

type LFields = [(FieldName, LTerm)]
```

#### Update Lambda and Other Types

```haskell
-- Before
data Lambda = Unary VarName PosInf Term
            | Nullary Term

-- After
data Lambda = Unary VarName PosInf LTerm  -- Keep PosInf for argument position
            | Nullary LTerm
```

Note: The argument position in `Unary` is kept separate because it refers to the parameter, not the lambda itself.

#### Add Pattern Synonyms (Optional but Recommended)

```haskell
-- For pattern matching when you don't need the position
pattern Var' :: VarAccess -> LTerm
pattern Var' v <- L _ (Var v)

pattern App' :: LTerm -> LTerm -> LTerm
pattern App' e1 e2 <- L _ (App e1 e2)

pattern If' :: LTerm -> LTerm -> LTerm -> LTerm
pattern If' c t e <- L _ (If c t e)

pattern Let' :: Decl -> LTerm -> LTerm
pattern Let' d body <- L _ (Let d body)

pattern Lit' :: Lit -> LTerm
pattern Lit' l <- L _ (Lit l)

-- Add for all Term constructors as needed
```

#### Remove Old GetPosInfo Instance

The old 17-case instance is no longer needed.

#### Update Exports

```haskell
, LTerm
, LDecl
, LFields
-- Pattern synonyms if added
, pattern Var'
, pattern App'
-- etc.
```

### 2. Update DirectWOPats.hs

Remove the temporary adapter and produce proper `Located` Core terms.

#### Update Imports

```haskell
import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, PosInf(..))
import qualified Core
import qualified Direct as D
```

#### Update lower Function

**Before (adapter from Stage 2):**
```haskell
lower :: D.LTerm -> Core.Term
lower (L pos (D.Var x)) = Core.Var (Core.RegVar x) pos
lower (L pos (D.App e1 e2)) = Core.App (lower e1) (lower e2) pos
```

**After (proper Located output):**
```haskell
lower :: D.LTerm -> Core.LTerm
lower (L pos (D.Var x)) = L pos (Core.Var (Core.RegVar x))
lower (L pos (D.App e1 e2)) = L pos (Core.App (lower e1) (lower e2))
lower (L pos (D.Lit lit)) = L pos (Core.Lit lit)
lower (L pos (D.If c t e)) = L pos (Core.If (lower c) (lower t) (lower e))
-- etc. for all cases
```

### 3. Add Temporary Adapter in RetDFCPS.hs

The CPS transformation consumes `Core.LTerm` and produces `CPS.KTerm`. Until CPS is migrated, we need to extract positions from `Located` Core terms.

#### Update Imports

```haskell
import TroupePositionInfo (Located(..), getLoc, unLoc, PosInf(..))
import qualified Core
```

#### Update transExplicit and Related Functions

**Before:**
```haskell
transExplicit :: Core.Term -> S CPS.KTerm
transExplicit (Core.Var (Core.RegVar x) pos) = return $ KontReturn (VN x) pos
transExplicit (Core.App e1 e2 pos) = do
  trans e1 (\x1 ->
    trans e2 (\x2 ->
      return $ ApplyFun x1 x2 pos))
```

**After (adapter pattern):**
```haskell
transExplicit :: Core.LTerm -> S CPS.KTerm
transExplicit (L pos (Core.Var (Core.RegVar x))) = return $ KontReturn (VN x) pos
transExplicit (L pos (Core.App e1 e2)) = do
  trans e1 (\x1 ->
    trans e2 (\x2 ->
      return $ ApplyFun x1 x2 pos))
-- Extract pos from Located, embed in old-style CPS constructor
```

Update `trans` similarly to work with `Core.LTerm`.

## Verification

```bash
make all && make test
```

All tests must pass. The adapter in RetDFCPS ensures that CPS output is identical to before.

## Commit Message

```
refactor(compiler): migrate Core AST to Located wrappers

- Update Core.hs: remove embedded PosInf from all constructors
- Update DirectWOPats.hs: produce Located Core terms (remove Stage 2 adapter)
- Add temporary adapter in RetDFCPS.hs to maintain CPS compatibility

The adapter extracts positions from Located Core and embeds them in
old-style CPS constructors. This will be removed when CPS is migrated
in Stage 4.
```

## Next Stage

After committing, update [handoff.md](handoff.md) and proceed to Stage 4 in a fresh context.
