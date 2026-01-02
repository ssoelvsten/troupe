# Stage 2: Parser + Direct AST

**Status**: Not started
**Depends on**: Stage 1 complete
**Fresh context**: Yes - start a new Claude Code session for this stage

## Goal

Migrate the Direct AST to use `Located` wrappers and update the Parser to produce `Located` terms. Add a temporary adapter in DirectWOPats to maintain compatibility with downstream code.

## Files to Modify

- `compiler/src/Direct.hs` - AST type definitions
- `compiler/src/Parser.y` - Parser that produces Direct AST

## Files to Add Adapter

- `compiler/src/DirectWOPats.hs` - Temporary adapter to extract positions for old-style Core

## Implementation

### 1. Update Direct.hs

#### Add Imports

```haskell
import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, PosInf(..), GetPosInfo(..))
```

#### Define Located Type Aliases

```haskell
type LTerm = Located Term
type LDecl = Located Decl
type LDeclPattern = Located DeclPattern
```

#### Transform Term Data Type

**Before:**
```haskell
data Term
    = Lit Lit
    | Var VarName PosInf
    | Abs Lambda PosInf
    | Hnd Handler PosInf
    | App Term Term PosInf
    | Let [Decl] Term PosInf
    | Case Term [(DeclPattern, Term)] PosInf
    | If Term Term Term PosInf
    | Tuple [Term] PosInf
    | Record [(FieldName, Maybe Term)] PosInf
    | WithRecord Term [(FieldName, Maybe Term)] PosInf
    | ProjField Term FieldName PosInf
    | ProjIdx Term Int PosInf
    | List [Term] PosInf
    | ListCons Term Term PosInf
    | Bin BinOp Term Term PosInf
    | Un UnaryOp Term PosInf
    | Seq [Term] PosInf
    | Error Term PosInf
```

**After:**
```haskell
data Term
    = Lit Lit
    | Var VarName
    | Abs Lambda
    | Hnd Handler
    | App LTerm LTerm
    | Let [Decl] LTerm
    | Case LTerm [(DeclPattern, LTerm)]
    | If LTerm LTerm LTerm
    | Tuple [LTerm]
    | Record [(FieldName, Maybe LTerm)]
    | WithRecord LTerm [(FieldName, Maybe LTerm)]
    | ProjField LTerm FieldName
    | ProjIdx LTerm Int
    | List [LTerm]
    | ListCons LTerm LTerm
    | Bin BinOp LTerm LTerm
    | Un UnaryOp LTerm
    | Seq [LTerm]
    | Error LTerm
```

#### Transform DeclPattern Data Type

**Before:**
```haskell
data DeclPattern
    = VarPattern VarName PosInf
    | ValPattern Lit PosInf
    | AtPattern DeclPattern String PosInf
    | Wildcard PosInf
    | TuplePattern [DeclPattern] PosInf
    | ConsPattern DeclPattern DeclPattern PosInf
    | ListPattern [DeclPattern] PosInf
    | RecordPattern [(FieldName, Maybe DeclPattern)] RecordPatternMode PosInf
```

**After:**
```haskell
data DeclPattern
    = VarPattern VarName
    | ValPattern Lit
    | AtPattern LDeclPattern String
    | Wildcard
    | TuplePattern [LDeclPattern]
    | ConsPattern LDeclPattern LDeclPattern
    | ListPattern [LDeclPattern]
    | RecordPattern [(FieldName, Maybe LDeclPattern)] RecordPatternMode
```

#### Update Other Types Similarly

- `Decl` - remove embedded `PosInf`
- `FunDecl` - remove embedded `PosInf`
- `Lambda`, `Handler` - update to use `LTerm`, `LDeclPattern`

#### Remove GetPosInfo Instance for DeclPattern

The old instance with 8 pattern matches is no longer needed - `GetPosInfo (Located a)` handles it.

#### Update Exports

Export the new type aliases:
```haskell
, LTerm
, LDecl
, LDeclPattern
```

### 2. Update Parser.y

#### Add Helper Function

Add near the `pos` function:

```haskell
-- | Create a Located value at the position of the given token
atPos :: Lexer.L Token -> a -> ReaderT FilePath (Except String) (Located a)
atPos tok x = do
    p <- pos tok
    return (Loc p x)
```

#### Update Grammar Rules

**Before:**
```haskell
| if Expr then Expr else Expr {% If $2 $4 $6 <$> pos $1 }
| Expr '-' Expr               {% Bin Minus $1 $3 <$> pos $2 }
| VAR                         {% Var (varTok $1) <$> pos $1 }
```

**After:**
```haskell
| if Expr then Expr else Expr {% atPos $1 (If $2 $4 $6) }
| Expr '-' Expr               {% atPos $2 (Bin Minus $1 $3) }
| VAR                         {% atPos $1 (Var (varTok $1)) }
```

#### Update Pattern Rules

**Before:**
```haskell
Pattern : VAR  {% pos $1 >>= \p -> return (VarPattern (varTok $1) p) }
        | '_'  {% pos $1 >>= \p -> return (Wildcard p) }
```

**After:**
```haskell
Pattern : VAR  {% atPos $1 (VarPattern (varTok $1)) }
        | '_'  {% atPos $1 Wildcard }
```

### 3. Add Temporary Adapter in DirectWOPats.hs

The `lower` function and related functions in DirectWOPats.hs consume `Direct.LTerm` and produce `Core.Term`. Until Core is migrated, we need to extract positions from `Located` and embed them in old-style Core constructors.

#### Update Imports

```haskell
import TroupePositionInfo (Located(..), getLoc, unLoc, PosInf(..))
import qualified Direct as D
```

#### Update lower Function

**Before:**
```haskell
lower :: D.Term -> Core.Term
lower (D.Var x pos) = Core.Var (Core.RegVar x) pos
lower (D.App e1 e2 pos) = Core.App (lower e1) (lower e2) pos
```

**After (adapter pattern):**
```haskell
lower :: D.LTerm -> Core.Term
lower (Loc pos (D.Var x)) = Core.Var (Core.RegVar x) pos
lower (Loc pos (D.App e1 e2)) = Core.App (lower e1) (lower e2) pos
-- Pattern: extract pos from Located, embed in old-style Core constructor
```

The key insight: `lower` now receives `Located Term` and extracts the position to embed in Core's old-style constructors. This is a temporary adapter that will be removed in Stage 3.

## Verification

```bash
make compiler && ./bin/golden --quick
```

All tests must pass. The adapter ensures that Core.Term output is identical to before the migration.

### Optional: Output Comparison

```bash
# Before changes (stash or use git diff)
bin/troupec tests/rt/pos/core/simple.trp -o /tmp/before.js

# After changes
bin/troupec tests/rt/pos/core/simple.trp -o /tmp/after.js

diff /tmp/before.js /tmp/after.js
# Should show no differences
```

## Commit Message

```
refactor(compiler): migrate Direct AST to Located wrappers

- Update Direct.hs: remove embedded PosInf from all constructors
- Update Parser.y: produce Located terms using atPos helper
- Add temporary adapter in DirectWOPats.hs to maintain Core compatibility

The adapter extracts positions from Located and embeds them in old-style
Core constructors. This will be removed when Core is migrated in Stage 3.
```

## Next Stage

After committing, update [handoff.md](handoff.md) and proceed to Stage 3 in a fresh context.
