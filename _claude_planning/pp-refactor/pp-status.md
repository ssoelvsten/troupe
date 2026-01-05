# Pretty Printing Refactoring Plan

## Implementation Status: PHASE 1-3 COMPLETE

**Completed 2026-01-05:**

### Completed Tasks

1. **Created `PrettyPrint.hs` module** with:
   - `PPConfig` configuration type with position format options
   - `PP` monad (Reader PPConfig)
   - `ppLocated` combinator for handling Located values
   - Monadic combinators (`<+>>`, `$$>`, `vcatMapPP`, etc.)
   - `runPPDefault` and `runPPDebug` runners

2. **Updated all IR modules to use PP monad:**
   - `Stack.hs` - Updated all `ppL*` functions to use `ppLocated`
   - `Raw.hs` - Updated all pretty printing to use PP monad
   - `IR.hs` - Updated including `ppLVA` for Located VarAccess
   - `RetCPS.hs` - Updated with `ppKTermInner` pattern
   - `Core.hs` - Updated with `qqLambda` returning `PP (Doc, Doc)`
   - `DirectWOPats.hs` - Updated all pretty printing functions

3. **Consolidated precedence definitions:**
   - Removed duplicate `appPrec`/`maxPrec` from `RetCPS.hs`
   - Now imported from `Basics.hs` (single source of truth)

### Key Pattern Applied

All `ppL*` functions now use:
```haskell
ppLTerm prec = ppLocated (ppTerm prec)  -- Position tracked!
```

Instead of the old:
```haskell
ppLTerm prec (Loc _ t) = ppTerm prec t  -- Position discarded!
```

### Remaining Work (Future Phases)

- Phase 4: Add compiler flags (`--debug-pp`, `--pp-pos-format`)
- Phase 6: Add `ShowDebug` type class

---

## Original Status Overview

The Troupe compiler uses `Text.PrettyPrint.HughesPJ` for pretty printing across 8 intermediate representations (IRs). Position information is tracked via the `Located` wrapper type, but is **not currently included in pretty printer output** except for source map markers in the final JS generation stage.

---

## Compilation Pipeline & IRs

| Stage | Module | IR Types | Position Tracking |
|-------|--------|----------|-------------------|
| 1. Parser Output | `Lexer.x`, `Parser.y` | Tokens | `SrcPosInf` attached |
| 2. Direct | `Direct.hs` | `Term`, `Decl` | Embedded in constructors |
| 3. DirectWOPats | `DirectWOPats.hs` | `LTerm` | `Located` wrapper |
| 4. Core | `Core.hs` | `LTerm` | `Located` wrapper |
| 5. RetCPS | `RetCPS.hs` | `LKTerm` | `Located` wrapper |
| 6. IR | `IR.hs` | `LIRInst`, `LIRTerminator` | `Located` wrapper |
| 7. Raw | `Raw.hs` | `LRawInst`, `LRawTerminator` | `Located` wrapper |
| 8. Stack | `Stack.hs` | `LStackInst`, `LStackTerminator` | `Located` wrapper |
| 9. JavaScript | `Stack2JS.hs` | JS strings | Source map markers |

---

## Current Pretty Printing Approach

### Pattern Used Across All Stages

```haskell
-- Type-specific pretty printers
ppTerm :: Precedence -> Term -> PP.Doc
ppLTerm :: Precedence -> LTerm -> PP.Doc
ppLTerm prec (Loc _ t) = ppTerm prec t     -- Position discarded!

-- Show instances
instance Show Term where
  show t = PP.render (ppTerm 0 t)
```

### Key Files

| File | Pretty Printing Functions | Lines |
|------|---------------------------|-------|
| `DirectWOPats.hs` | `ppProg`, `ppLTerm`, `ppTerm`, `ppDecl`, `ppLit` | 103-200 |
| `Core.hs` | `ppProg`, `ppLTerm`, `ppTermInner`, `ppLit` | 549-700 |
| `RetCPS.hs` | `ppProg`, `ppKTerm`, `ppSimpleTerm` | 137-281 |
| `IR.hs` | `ppProg`, `ppLFunDef`, `ppIRExpr`, `ppLIR` | 430-567 |
| `Raw.hs` | `ppProg`, `ppFunDef`, `ppRawExpr`, `ppLIR` | 276-350 |
| `Stack.hs` | `ppProg`, `ppFunDef`, `ppIR`, `ppLStackInst` | 105-193 |

---

## Identified Problems

### 1. Position Information Not Visible in Debug Output

**Problem:** When debugging compiler issues between stages, positions are silently discarded:
```haskell
ppLTerm prec (Loc _ t) = ppTerm prec t  -- Position thrown away
```

**Impact:** Cannot trace where a term originated when reading intermediate output.

### 2. No Configurable Pretty Printing

**Problem:** Pretty printing is hard-coded with fixed formatting. No way to:
- Toggle position annotation display
- Adjust indentation width
- Set line width for wrapping
- Choose between compact/verbose output

### 3. Inconsistent Precedence Definitions

**Problem:** Operator precedence constants defined in multiple locations:
- `Basics.hs`: `appPrec=5000`, `argPrec=5001`, `maxPrec=100000`, `consPrec=6000`
- `RetCPS.hs`: Redefines precedence values independently
- Individual IR modules may have local definitions

### 4. Boilerplate `ppL...` Functions

**Problem:** Every IR stage repeats the same pattern:
```haskell
ppLFunDef (Loc _ fdef) = ppFunDef fdef
ppLStackInst (Loc _ i) = ppIR i
ppLTerm prec (Loc _ t) = ppTerm prec t
```
No unified abstraction for "unwrap Located and pretty print."

### 5. No Unified Debug Mode

**Problem:** Stack2JS has source map marker generation, but no intermediate stage can emit position-annotated output for debugging.

---

## Proposed Refactoring

### Phase 1: Create Unified Pretty Printing Infrastructure

**Goal:** Centralize pretty printing configuration and the PP monad.

#### 1.1 Create `PrettyPrint.hs` Module

```haskell
-- compiler/src/PrettyPrint.hs
module PrettyPrint (
  -- Configuration
  PPConfig(..),
  PosFormat(..),
  defaultPPConfig,
  debugPPConfig,

  -- The PP monad
  PP,
  runPP,
  runPPDefault,
  runPPDebug,

  -- Config accessors
  askShowPositions,
  askPosFormat,
  askIndentWidth,

  -- Position annotation
  annotatePos,
  ppLocated,

  -- Monadic combinators
  (<+>>), ($$>),
  nestPP,
  vcatPP,
  vcatMapPP,

  -- Re-export HughesPJ
  module Text.PrettyPrint.HughesPJ
) where

import Control.Monad.Reader
import Text.PrettyPrint.HughesPJ
import TroupePositionInfo

-- Configuration for pretty printing
data PPConfig = PPConfig
  { ppShowPositions :: Bool      -- Include position annotations
  , ppIndentWidth   :: Int       -- Indentation width (default: 2)
  , ppLineWidth     :: Int       -- Target line width (default: 80)
  , ppVerbose       :: Bool      -- Verbose output mode
  , ppPosFormat     :: PosFormat -- How to format positions
  }

data PosFormat
  = PosInline      -- term @file:line:col
  | PosComment     -- term /* file:line:col */
  | PosBracket     -- [file:line:col] term
  | PosNone        -- no position (ignore config)

defaultPPConfig :: PPConfig
defaultPPConfig = PPConfig
  { ppShowPositions = False
  , ppIndentWidth   = 2
  , ppLineWidth     = 80
  , ppVerbose       = False
  , ppPosFormat     = PosInline
  }

debugPPConfig :: PPConfig
debugPPConfig = defaultPPConfig { ppShowPositions = True }
```

### Phase 2: Reader Monad for Pretty Printing Context

**Goal:** Use Reader monad to thread configuration implicitly through pretty printing functions.

#### 2.1 Define the PP Monad

```haskell
-- compiler/src/PrettyPrint.hs
import Control.Monad.Reader

-- The pretty printing monad
type PP a = Reader PPConfig a

-- Run with a configuration
runPP :: PPConfig -> PP Doc -> Doc
runPP cfg m = runReader m cfg

-- Convenience runners
runPPDefault :: PP Doc -> Doc
runPPDefault = runPP defaultPPConfig

runPPDebug :: PP Doc -> Doc
runPPDebug = runPP debugPPConfig

-- Access config within PP monad
askShowPositions :: PP Bool
askShowPositions = asks ppShowPositions

askPosFormat :: PP PosFormat
askPosFormat = asks ppPosFormat

askIndentWidth :: PP Int
askIndentWidth = asks ppIndentWidth
```

#### 2.2 Position Annotation in PP Monad

```haskell
-- Annotate a Doc with position info (monadic version)
annotatePos :: PosInf -> Doc -> PP Doc
annotatePos pos doc = do
  showPos <- askShowPositions
  fmt <- askPosFormat
  if not showPos
    then return doc
    else return $ doc <> formatPos fmt pos

formatPos :: PosFormat -> PosInf -> Doc
formatPos _ NoPos = empty
formatPos _ (RTGen s) = text $ " @RTGen<" ++ s ++ ">"
formatPos PosNone _ = empty
formatPos PosInline (SrcPosInf f l c) = text $ " @" ++ f ++ ":" ++ show l ++ ":" ++ show c
formatPos PosComment (SrcPosInf f l c) = text $ " /* " ++ f ++ ":" ++ show l ++ ":" ++ show c ++ " */"
formatPos PosBracket (SrcPosInf f l c) = brackets (text $ f ++ ":" ++ show l ++ ":" ++ show c)

-- Generic helper for Located values
ppLocated :: (a -> PP Doc) -> Located a -> PP Doc
ppLocated ppInner (Loc pos inner) = do
  doc <- ppInner inner
  annotatePos pos doc
```

#### 2.3 Update Type Signatures

Transform each IR module's pretty printers to return `PP Doc`:

```haskell
-- Before (DirectWOPats.hs)
ppTerm :: Precedence -> Term -> PP.Doc
ppLTerm :: Precedence -> LTerm -> PP.Doc
ppLTerm prec (Loc _ t) = ppTerm prec t

-- After (using PP monad)
ppTerm :: Precedence -> Term -> PP Doc
ppLTerm :: Precedence -> LTerm -> PP Doc
ppLTerm prec = ppLocated (ppTerm prec)  -- Clean and simple!
```

#### 2.4 Provide Backward-Compatible Defaults

```haskell
-- Show instances use default (no positions)
instance Show Term where
  show t = PP.render (runPPDefault (ppTerm 0 t))

-- Debug function with positions
showTermDebug :: Term -> String
showTermDebug t = PP.render (runPPDebug (ppTerm 0 t))
```

#### 2.5 Monadic Combinators

```haskell
-- Lifted versions of HughesPJ combinators for convenience
infixl 6 <+>>, <<+>
infixl 5 $$>

-- Horizontal with space
(<+>>) :: PP Doc -> PP Doc -> PP Doc
(<+>>) = liftM2 (<+>)

-- Vertical
($$>) :: PP Doc -> PP Doc -> PP Doc
($$>) = liftM2 ($$)

-- Nest with config-aware indentation
nestPP :: PP Doc -> PP Doc
nestPP inner = do
  width <- askIndentWidth
  doc <- inner
  return $ nest width doc

-- Vertical concat
vcatPP :: [PP Doc] -> PP Doc
vcatPP = fmap vcat . sequence

-- Map and vcat
vcatMapPP :: (a -> PP Doc) -> [a] -> PP Doc
vcatMapPP f xs = vcatPP (map f xs)
```

### Phase 3: Update Each IR Stage

**Goal:** Systematically update each IR module to use the `PP` monad.

The key insight is that with the Reader monad, all `ppL...` functions become trivial applications of `ppLocated`:

```haskell
-- Generic pattern for all Located wrappers
ppLTerm prec = ppLocated (ppTerm prec)
ppLFunDef    = ppLocated ppFunDef
ppLInst      = ppLocated ppInst
-- etc.
```

#### 3.1 DirectWOPats.hs Changes

```haskell
-- Before
ppProg :: Prog -> PP.Doc
ppLTerm :: Precedence -> LTerm -> PP.Doc
ppLTerm prec (Loc _ t) = ppTerm prec t
ppTerm :: Precedence -> Term -> PP.Doc

-- After
ppProg :: Prog -> PP Doc
ppLTerm :: Precedence -> LTerm -> PP Doc
ppLTerm prec = ppLocated (ppTerm prec)  -- Position now tracked!
ppTerm :: Precedence -> Term -> PP Doc
ppTerm prec term = case term of
  Var vn -> return $ textv vn
  App t1 t2 -> do
    d1 <- ppLTerm appPrec t1
    d2 <- ppLTerm argPrec t2
    return $ parensIf (prec > appPrec) (d1 <+> d2)
  Let decls body -> do
    declDocs <- mapM ppDecl decls
    bodyDoc <- ppLTerm 0 body
    return $ text "let" <+> vcat declDocs $$ text "in" <+> bodyDoc
  ...
```

#### 3.2 Core.hs Changes

```haskell
ppLTerm :: Precedence -> LTerm -> PP Doc
ppLTerm prec = ppLocated (ppTermInner prec)

ppTermInner :: Precedence -> Term -> PP Doc
ppTermInner prec term = case term of
  Lit l -> ppLit l
  Var vn -> return $ textv vn
  Lam lam -> ppLambda lam
  ...

ppLambda :: Lambda -> PP Doc
ppLambda (Lambda args body) = do
  bodyDoc <- ppLTerm 0 body
  return $ text "fn" <+> ppArgs args <+> text "=>" <+> bodyDoc
```

#### 3.3 RetCPS.hs Changes

```haskell
ppKTerm :: Precedence -> LKTerm -> PP Doc
ppKTerm prec = ppLocated (ppKTermInner prec)

ppKTermInner :: Precedence -> KTerm -> PP Doc
ppKTermInner prec kt = case kt of
  KLetVal vn st body -> do
    stDoc <- ppSimpleTerm st
    bodyDoc <- ppKTerm 0 body
    return $ text "let" <+> textv vn <+> text "=" <+> stDoc $$ bodyDoc
  ...

ppSimpleTerm :: SimpleTerm -> PP Doc
ppSimpleTerm st = case st of
  SVal lsv -> ppLocated ppSValInner lsv
  ...
```

#### 3.4 IR.hs Changes

```haskell
ppLFunDef :: LFunDef -> PP Doc
ppLFunDef = ppLocated ppFunDef

ppFunDef :: FunDef -> PP Doc
ppFunDef (FunDef hfn args consts bb) = do
  bbDoc <- ppBB bb
  return $ vcat
    [ text "func" <+> ppFunCall (ppId hfn) (map ppId args) <+> text "{"
    , nest 2 (ppConsts consts)
    , nest 2 bbDoc
    , text "}"
    ]

ppLIR :: LIRInst -> PP Doc
ppLIR = ppLocated ppIRInst

ppLTr :: LIRTerminator -> PP Doc
ppLTr = ppLocated ppIRTerminator

ppBB :: BB -> PP Doc
ppBB (BB insts tr) = do
  instDocs <- mapM ppLIR insts
  trDoc <- ppLTr tr
  return $ vcat (instDocs ++ [trDoc])
```

#### 3.5 Raw.hs Changes

```haskell
ppLRawInst :: LRawInst -> PP Doc
ppLRawInst = ppLocated ppRawInst

ppLRawTerminator :: LRawTerminator -> PP Doc
ppLRawTerminator = ppLocated ppRawTerminator
```

#### 3.6 Stack.hs Changes

```haskell
ppLStackInst :: LStackInst -> PP Doc
ppLStackInst = ppLocated ppStackInst

ppLStackTerminator :: LStackTerminator -> PP Doc
ppLStackTerminator = ppLocated ppStackTerminator
```

### Phase 4: Add Debug Output Commands

**Goal:** Enable position-annotated output via compiler flags.

#### 4.1 Add Compiler Flags

```haskell
-- In compiler options/flags
data CompilerFlags = CompilerFlags
  { ...
  , cfDebugPP :: Bool        -- --debug-pp: show positions in IR dumps
  , cfPPFormat :: PosFormat  -- --pp-pos-format=inline|comment|bracket
  }
```

#### 4.2 Update Verbose Output

The compiler already has `-v` for verbose output (writing to `/out` folder). Update this to use `debugPPConfig` when `--debug-pp` is enabled:

```haskell
dumpIR :: CompilerFlags -> String -> IRProgram -> IO ()
dumpIR flags stage prog = do
  let cfg = if cfDebugPP flags then debugPPConfig else defaultPPConfig
  let content = PP.render (ppProg cfg prog)
  writeFile (outDir </> stage ++ ".ir") content
```

### Phase 5: Consolidate Precedence Definitions

**Goal:** Single source of truth for operator precedence.

#### 5.1 Move All Precedence to Basics.hs

```haskell
-- compiler/src/Basics.hs
module Basics where

-- Precedence levels (higher binds tighter)
type Precedence = Int

-- Application and arguments
appPrec, argPrec :: Precedence
appPrec = 5000
argPrec = 5001

-- Operators
consPrec, projPrec :: Precedence
consPrec = 6000
projPrec = 6100

-- Special values
minPrec, maxPrec :: Precedence
minPrec = 0
maxPrec = 100000

-- Comparison operators
ltPrec, lePrec, gtPrec, gePrec, eqPrec, neqPrec :: Precedence
ltPrec = 400
lePrec = 400
gtPrec = 400
gePrec = 400
eqPrec = 400
neqPrec = 400

-- Logical operators
andPrec, orPrec :: Precedence
andPrec = 300
orPrec = 200

-- Arithmetic operators
plusPrec, minusPrec, timesPrec, divPrec :: Precedence
plusPrec = 500
minusPrec = 500
timesPrec = 600
divPrec = 600
```

#### 5.2 Update All Modules to Import from Basics

Remove local precedence definitions from:
- `RetCPS.hs`
- `Core.hs`
- `DirectWOPats.hs`

### Phase 6: Create ShowDebug Type Class

**Goal:** Unified interface for debug output with positions.

```haskell
-- compiler/src/PrettyPrint.hs
class ShowDebug a where
  showDebug :: a -> String
  showDebugWith :: PPConfig -> a -> String

  -- Default implementation
  showDebug = showDebugWith debugPPConfig

-- Instances for each IR
instance ShowDebug DirectWOPats.Prog where
  showDebugWith cfg p = PP.render (ppProg cfg p)

instance ShowDebug Core.Prog where
  showDebugWith cfg p = PP.render (ppProg cfg p)

instance ShowDebug RetCPS.Prog where
  showDebugWith cfg p = PP.render (ppProg cfg p)

instance ShowDebug IR.IRProgram where
  showDebugWith cfg p = PP.render (ppProg cfg p)

instance ShowDebug Raw.RawProgram where
  showDebugWith cfg p = PP.render (ppProg cfg p)

instance ShowDebug Stack.StackProgram where
  showDebugWith cfg p = PP.render (ppProg cfg p)
```

---

## Implementation Order

| Phase | Effort | Dependencies | Files Modified |
|-------|--------|--------------|----------------|
| 1. PP Monad Infrastructure | Medium | None | New `PrettyPrint.hs` |
| 2. (merged into Phase 1) | - | - | - |
| 3.1 DirectWOPats | Medium | Phase 1 | `DirectWOPats.hs` |
| 3.2 Core | Medium | Phase 1 | `Core.hs` |
| 3.3 RetCPS | Medium | Phase 1 | `RetCPS.hs` |
| 3.4 IR | Medium | Phase 1 | `IR.hs` |
| 3.5 Raw | Low | Phase 1 | `Raw.hs` |
| 3.6 Stack | Low | Phase 1 | `Stack.hs` |
| 4. Compiler Flags | Low | Phase 3 | `Main.hs`, flag parsing |
| 5. Precedence Consolidation | Low | None (parallel) | `Basics.hs`, all IR modules |
| 6. ShowDebug Class | Low | Phases 1-3 | `PrettyPrint.hs` |

**Recommended approach:** Implement Phase 1 first, then update IR stages incrementally (3.6 Stack → 3.5 Raw → 3.4 IR → ...) working backward through the pipeline. This allows testing each stage in isolation since later stages have simpler pretty printing.

---

## Example Output Comparison

### Current Output (no positions)

```
func $main () {
  let x = add(1, 2)
  let y = mul(x, 3)
  return y
}
```

### With `--debug-pp` (PosInline format)

```
func $main () { @test.trp:1:1
  let x = add(1, 2) @test.trp:2:3
  let y = mul(x, 3) @test.trp:3:3
  return y @test.trp:4:3
}
```

### With `--debug-pp --pp-pos-format=comment`

```
func $main () { /* test.trp:1:1 */
  let x = add(1, 2) /* test.trp:2:3 */
  let y = mul(x, 3) /* test.trp:3:3 */
  return y /* test.trp:4:3 */
}
```

### With `--debug-pp --pp-pos-format=bracket`

```
[test.trp:1:1] func $main () {
  [test.trp:2:3] let x = add(1, 2)
  [test.trp:3:3] let y = mul(x, 3)
  [test.trp:4:3] return y
}
```

---

## Testing Strategy

1. **Unit Tests:** Add tests for `PrettyPrint.hs` utilities
2. **Golden Tests:** Compare pretty printer output with/without positions
3. **Round-Trip Tests:** Ensure position-annotated output is parseable (if desired)
4. **Integration Tests:** Verify `-v --debug-pp` produces expected output files

---

## Benefits

1. **Debugging:** Easily trace terms back to source locations between stages
2. **Maintainability:** Centralized pretty printing configuration
3. **Consistency:** Single precedence definition, unified patterns
4. **Flexibility:** Multiple output formats for different use cases
5. **Backward Compatibility:** Default behavior unchanged; opt-in position display

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing Show instances | Use default config for Show, add ShowDebug separately |
| Performance overhead | Position annotation only when enabled |
| Large diff across many files | Implement in phases, test incrementally |
| Position clutter in output | Multiple format options, default is no positions |

---

## Future Extensions

1. **Colorized Output:** Terminal color support for positions
2. **Source Spans:** Support for range positions (start-end) not just points
3. **Interactive Mode:** REPL-style inspection of IRs at each stage
4. **Diff Visualization:** Side-by-side comparison of IRs between stages
5. **Position Validation:** Assert positions are monotonic/valid through pipeline
