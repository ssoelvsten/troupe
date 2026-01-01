# Source Provenance: Detailed Code Changes

This document shows the exact code changes required for each phase of the source provenance implementation.

**Key Principle**: Each phase adds functionality without breaking the compiler. The compiler produces valid output at every step.

---

## Phase Overview (Modular Development)

| Phase | Changes | Breaks Pipeline? |
|-------|---------|------------------|
| 0 | Parser filename (ReaderT) | No |
| 1 | Source map infrastructure | No |
| 2 | Stack + PosInf (NoPos default) | No |
| 3 | Raw + PosInf (NoPos default) | No |
| 4 | IR + PosInf (NoPos default) | No |
| 5 | Fix optimizations | No |
| 6 | Thread from CPS | No |
| 7 | Runtime source map resolver | No (runtime only) |
| 8 | Direct position parameters | No |

---

## Phase 0: Parser Filename (Happy's Reader Monad)

**Goal**: Existing positions include filename instead of empty string.

### 0.1 Parser.y - Add Reader import

```haskell
-- FILE: compiler/src/Parser.y

-- BEFORE (lines 1-17):
{
{-# LANGUAGE GeneralizedNewtypeDeriving #-}

module Parser (
  parseProg,
  parseTokens,
) where

import Lexer
import Direct
import DCLabels
import Basics
import TroupePositionInfo

import Control.Monad.Except
import Data.List (group, sort, intercalate)

}

-- AFTER:
{
{-# LANGUAGE GeneralizedNewtypeDeriving #-}

module Parser (
  parseProg,
  parseTokens,
) where

import Lexer
import Direct
import DCLabels
import Basics
import TroupePositionInfo

import Control.Monad.Except
import Control.Monad.Reader    -- NEW: for Reader monad
import Data.List (group, sort, intercalate)

}
```

### 0.2 Parser.y - Change monad declaration

```haskell
-- FILE: compiler/src/Parser.y

-- BEFORE (line 27):
%monad { Except String } { (>>=) } { return }

-- AFTER:
%monad { ReaderT FilePath (Except String) } { (>>=) } { return }
```

### 0.3 Parser.y - Update parseError for new monad

```haskell
-- FILE: compiler/src/Parser.y

-- BEFORE (lines 383-388):
parseError :: [L Token] -> Except String a
parseError (l:ls) = do
    let (AlexPn _ line col) = getPos l
    let tks = unPos l
    throwError $ show line ++ ":" ++ show col  ++ " unexpected token " ++ (show tks)
parseError [] = throwError "Unexpected end of input"

-- AFTER:
parseError :: [L Token] -> ReaderT FilePath (Except String) a
parseError (l:ls) = do
    filename <- ask
    let (AlexPn _ line col) = getPos l
    let tks = unPos l
    let prefix = if null filename then "" else filename ++ ":"
    lift $ throwError $ prefix ++ show line ++ ":" ++ show col ++ " unexpected token " ++ (show tks)
parseError [] = lift $ throwError "Unexpected end of input"
```

### 0.4 Parser.y - Update pos function to use Reader

```haskell
-- FILE: compiler/src/Parser.y

-- BEFORE (lines 407-408):
pos l = let (AlexPn _ line col ) = getPos l
        in SrcPosInf "" line col

-- AFTER:
pos :: L Token -> ReaderT FilePath (Except String) PosInf
pos l = do
    filename <- ask
    let (AlexPn _ line col) = getPos l
    return $ SrcPosInf filename line col
```

### 0.5 Parser.y - Update grammar rules that use pos

Since `pos` is now monadic, grammar rules need to use `{% ... %}` for monadic actions:

```haskell
-- FILE: compiler/src/Parser.y

-- BEFORE (line 162):
AtomsDecl : datatype Atoms '=' VAR AtomsList    {% checkDuplicateAtoms ((varTok $4, pos $4):$5) }

-- AFTER:
AtomsDecl : datatype Atoms '=' VAR AtomsList    {% do { p <- pos $4; checkDuplicateAtoms ((varTok $4, p):$5) } }

-- BEFORE (line 166):
          | '|' VAR AtomsList  { (varTok $2, pos $2): $3 }

-- AFTER:
          | '|' VAR AtomsList  {% do { p <- pos $2; return $ (varTok $2, p): $3 } }

-- BEFORE (line 178):
    | case Expr of Match          { Case $2 $4 (pos $1) }

-- AFTER:
    | case Expr of Match          {% do { p <- pos $1; return $ Case $2 $4 p } }

-- BEFORE (line 243):
Lit:   NUM                        { LNumeric (NumInt (numTok $1)) (pos $1) }

-- AFTER:
Lit:   NUM                        {% do { p <- pos $1; return $ LNumeric (NumInt (numTok $1)) p } }

-- BEFORE (line 244):
     | FLOAT                       { LNumeric (NumFloat (floatTok $1)) (pos $1) }

-- AFTER:
     | FLOAT                       {% do { p <- pos $1; return $ LNumeric (NumFloat (floatTok $1)) p } }

-- BEFORE (line 329):
Dec : val Pattern '=' Expr      { ValDecl $2 $4 (pos $1 )}

-- AFTER:
Dec : val Pattern '=' Expr      {% do { p <- pos $1; return $ ValDecl $2 $4 p } }

-- BEFORE (line 355):
FunDecl    : fun VAR FunOptions { FunDecl (varTok $2) $3 (pos $2) }

-- AFTER:
FunDecl    : fun VAR FunOptions {% do { p <- pos $2; return $ FunDecl (varTok $2) $3 p } }

-- BEFORE (line 356):
AndFunDecl : and VAR FunOptions { FunDecl (varTok $2) $3 (pos $2) }

-- AFTER:
AndFunDecl : and VAR FunOptions {% do { p <- pos $2; return $ FunDecl (varTok $2) $3 p } }
```

### 0.6 Parser.y - Update checkDuplicateAtoms for new monad

```haskell
-- FILE: compiler/src/Parser.y

-- BEFORE (lines 411-422):
checkDuplicateAtoms :: [(String, PosInf)] -> Except String [AtomName]
checkDuplicateAtoms atoms
  | null dups = return names
  | otherwise = throwError $ intercalate "\n" (map formatOne dups)
  where
    names = map fst atoms
    dups = [n | (n:_:_) <- group (sort names)]
    formatOne d =
      let positions = [p | (n, p) <- atoms, n == d]
      in "Duplicate constructor '" ++ d ++ "' at " ++
         intercalate " and " (map show positions)

-- AFTER:
checkDuplicateAtoms :: [(String, PosInf)] -> ReaderT FilePath (Except String) [AtomName]
checkDuplicateAtoms atoms
  | null dups = return names
  | otherwise = lift $ throwError $ intercalate "\n" (map formatOne dups)
  where
    names = map fst atoms
    dups = [n | (n:_:_) <- group (sort names)]
    formatOne d =
      let positions = [p | (n, p) <- atoms, n == d]
      in "Duplicate constructor '" ++ d ++ "' at " ++
         intercalate " and " (map show positions)
```

### 0.7 Parser.y - Update parseProg signature

```haskell
-- FILE: compiler/src/Parser.y

-- BEFORE (lines 395-398):
parseProg :: String -> Either String Prog
parseProg input = runExcept $ do
  tokenStream <- scanTokens input
  prog tokenStream

-- AFTER:
parseProg :: FilePath -> String -> Either String Prog
parseProg filename input = runExcept $ do
  tokenStream <- scanTokens input
  runReaderT (prog tokenStream) filename
```

### 0.8 Main.hs - Pass filename to parser

```haskell
-- FILE: compiler/app/Main.hs

-- Find the parseProg call and update it:
-- BEFORE (around line 71):
let ast = parseProg input

-- AFTER:
let ast = parseProg srcPath input
```

**Test**: Compile any program, verify pattern match errors show `filename.trp:LINE:COL`

---

## Phase 1: Source Map Infrastructure

**Goal**: Add `--source-map` flag and generate valid (but empty) `.map` files.

### 1.1 troupe-compile.cabal - Add dependency

```cabal
-- FILE: compiler/troupe-compile.cabal

-- In build-depends section, add:
    , sourcemap >= 0.1.7
```

### 1.2 Main.hs - Add source-map flag

```haskell
-- FILE: compiler/app/Main.hs

-- Add to Flag data type:
data Flag = ... | SourceMap deriving (Show, Eq)

-- Add to options list:
options = [
    ...
    , Option ['m'] ["source-map"] (NoArg SourceMap) "generate source map"
]

-- In main, when writing output:
let sourceMapEnabled = SourceMap `elem` flags
when sourceMapEnabled $ do
    let mapJson = buildSourceMap outPath []  -- empty mappings initially
    BL.writeFile (outPath ++ ".map") (encode mapJson)
```

### 1.3 TroupeSourceMap.hs - Create wrapper module (NEW FILE)

```haskell
-- FILE: compiler/src/TroupeSourceMap.hs (NEW FILE)

module TroupeSourceMap
  ( collectMapping
  , buildSourceMap
  ) where

import SourceMap (generate)
import SourceMap.Types (SourceMapping(..), Mapping(..), Pos(..))
import TroupePositionInfo (PosInf(..))
import Data.Int (Int32)
import Data.Aeson (Value)
import qualified Data.Text as T

-- | Convert a PosInf and output position to a Mapping
collectMapping :: PosInf -> Int -> Int -> Maybe Mapping
collectMapping (SrcPosInf srcFile srcLine srcCol) genLine genCol =
  Just $ Mapping
    { mapGenerated = Pos (fromIntegral genLine) (fromIntegral genCol)
    , mapOriginal = Just $ Pos (fromIntegral srcLine) (fromIntegral $ srcCol - 1)
    , mapSourceFile = Just srcFile
    , mapName = Nothing
    }
collectMapping _ _ _ = Nothing  -- RTGen, NoPos: no mapping

-- | Build final source map from collected mappings
buildSourceMap :: FilePath -> [Mapping] -> Value
buildSourceMap outFile mappings = generate $ SourceMapping
  { smFile = outFile
  , smSourceRoot = Nothing
  , smMappings = mappings
  }
```

**Test**: Compile with `--source-map`, verify `.map` file is valid JSON with empty mappings.

---

## Phase 2: Stack Instructions with Position (Backwards Compatible)

**Goal**: Add `PosInf` to Stack types, default to `NoPos`, prepare for mapping collection.

### 2.1 Stack.hs - Add PosInf to StackInst

```haskell
-- FILE: compiler/src/Stack.hs

-- BEFORE (lines 63-74):
data StackInst
  = AssignRaw RawAssignType RawVar RawExpr
  | LabelGroup [StackInst]
  | AssignLVal VarName RawExpr
  | FetchStack Assignable StackPos
  | StoreStack Assignable StackPos
  | SetState MonComponent RawVar
  | SetBranchFlag
  | InvalidateSparseBit
  | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]
  | RTAssertion RTAssertion
   deriving (Eq, Show)

-- AFTER:
data StackInst
  = AssignRaw RawAssignType RawVar RawExpr PosInf
  | LabelGroup [StackInst] PosInf
  | AssignLVal VarName RawExpr PosInf
  | FetchStack Assignable StackPos PosInf
  | StoreStack Assignable StackPos PosInf
  | SetState MonComponent RawVar PosInf
  | SetBranchFlag PosInf
  | InvalidateSparseBit PosInf
  | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)] PosInf
  | RTAssertion RTAssertion PosInf
   deriving (Eq, Show)
```

### 2.2 Stack.hs - Add PosInf to StackTerminator

```haskell
-- FILE: compiler/src/Stack.hs

-- BEFORE (lines 43-50):
data StackTerminator
  = TailCall RawVar
  | Ret
  | If RawVar StackBBTree StackBBTree
  | LibExport VarAccess
  | Error RawVar PosInf                    -- already has it
  | StackExpand  StackBBTree StackBBTree
  deriving (Eq, Show)

-- AFTER:
data StackTerminator
  = TailCall RawVar PosInf
  | Ret PosInf
  | If RawVar StackBBTree StackBBTree PosInf
  | LibExport VarAccess PosInf
  | Error RawVar PosInf
  | StackExpand StackBBTree StackBBTree PosInf
  deriving (Eq, Show)
```

### 2.3 Raw2Stack.hs - Pass NoPos (for now)

```haskell
-- FILE: compiler/src/Raw2Stack.hs

-- Update trOneRegInst to pass NoPos for all new positions:
trOneRegInst :: Raw.RawInst -> Tr [Stack.StackInst]
trOneRegInst i = do
  __offsets <- offsets <$> ask
  rel <- offsetWithCallDepth
  let store a =
          case Map.lookup a __offsets of
              Nothing -> []
              Just i ->  [Stack.StoreStack a (rel i) NoPos]
  case i of
    Raw.AssignRaw x e -> return $
      (Stack.AssignRaw Stack.AssignConst x e NoPos):(store (Raw.AssignableRaw x))
    Raw.AssignLVal x e -> return $
      (Stack.AssignLVal x e NoPos):(store (Raw.AssignableLVal x))
    Raw.SetState cmp x -> return [Stack.SetState cmp x NoPos]
    Raw.SetBranchFlag -> return [Stack.SetBranchFlag NoPos]
    Raw.InvalidateSparseBit -> return [Stack.InvalidateSparseBit NoPos]
    Raw.MkFunClosures envmap vars -> do
      let stores = concat $ map (\v -> store (Raw.AssignableLVal v)) (fst (unzip vars))
      return $ (Stack.MkFunClosures envmap vars NoPos):stores
    Raw.RTAssertion a -> return [Stack.RTAssertion a NoPos]

-- Update trTr for terminators to pass NoPos:
trTr :: Raw.RawTerminator -> Tr Stack.StackTerminator
trTr (Raw.TailCall r) = return $ Stack.TailCall r NoPos
trTr Raw.Ret = return $ Stack.Ret NoPos
trTr (Raw.If r bb1 bb2) = do
     bb1' <- trBB bb1
     bb2' <- trBB bb2
     return $ Stack.If r bb1' bb2' NoPos
trTr (Raw.LibExport v) = return $ Stack.LibExport v NoPos
trTr (Raw.Error r1 p) = return $ Stack.Error r1 p  -- already has position
trTr (Raw.StackExpand bb1 bb2) = do
   bb1' <- trBB bb1
   bb2' <- trBB bb2
   return $ Stack.StackExpand bb1' bb2' NoPos
```

### 2.4 Stack2JS.hs - Extend state and collect mappings

```haskell
-- FILE: compiler/src/Stack2JS.hs

-- Add to imports:
import SourceMap.Types (Mapping)
import TroupeSourceMap (collectMapping)
import TroupePositionInfo

-- BEFORE - TheState (around line 86):
data TheState = TheState
  { freshCounter :: Integer
  , frameSize :: Int
  , sparseSlot :: Int
  , consts :: Raw.Consts
  , stHFN :: IR.HFN
  }

-- AFTER:
data TheState = TheState
  { freshCounter :: Integer
  , frameSize :: Int
  , sparseSlot :: Int
  , consts :: Raw.Consts
  , stHFN :: IR.HFN
  , outputLine :: Int      -- Current output line number
  , outputCol :: Int       -- Current output column
  }

-- BEFORE - WData (around line 94):
type WData = ([LibAccess], [Basics.AtomName], [RetKontText])

-- AFTER:
type WData = ([LibAccess], [Basics.AtomName], [RetKontText], [Mapping])

-- Add helper to record a source mapping:
recordMapping :: PosInf -> W ()
recordMapping pos = do
  outLine <- gets outputLine
  outCol <- gets outputCol
  case collectMapping pos outLine outCol of
    Just mapping -> tell ([], [], [], [mapping])
    Nothing -> return ()  -- RTGen and NoPos: no mapping

-- Update ir2js to use new position field (all positions will be NoPos for now):
ir2js :: Stack.StackInst -> W PP.Doc
ir2js (Stack.AssignRaw tt vn e pos) = do
  recordMapping pos
  jj <- toJS e
  let pfx = case tt of
             Stack.AssignConst -> text "const"
             Stack.AssignLet   -> text "let"
             Stack.AssignMut   -> PP.empty
  return $ semi $ pfx <+> ppId vn <+> text "=" <+> jj
-- ... update all other cases similarly
```

**Test**: Compile, verify no errors. Source maps still empty (NoPos everywhere).

---

## Phase 3: Raw Instructions with Position (Backwards Compatible)

**Goal**: Add `PosInf` to Raw types, thread from Raw to Stack.

### 3.1 Raw.hs - Add PosInf to RawInst

```haskell
-- FILE: compiler/src/Raw.hs

-- BEFORE (lines 128-147):
data RawInst
  = AssignRaw RawVar RawExpr
  | AssignLVal VarName RawExpr
  | SetState MonComponent RawVar
  | SetBranchFlag
  | InvalidateSparseBit
  | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]
  | RTAssertion RTAssertion
   deriving (Eq, Show)

-- AFTER:
data RawInst
  = AssignRaw RawVar RawExpr PosInf
  | AssignLVal VarName RawExpr PosInf
  | SetState MonComponent RawVar PosInf
  | SetBranchFlag PosInf
  | InvalidateSparseBit PosInf
  | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)] PosInf
  | RTAssertion RTAssertion PosInf
   deriving (Eq, Show)
```

### 3.2 Raw.hs - Add PosInf to RawTerminator

```haskell
-- FILE: compiler/src/Raw.hs

-- BEFORE (lines 152-161):
data RawTerminator
  = TailCall RawVar
  | Ret
  | If RawVar RawBBTree RawBBTree
  | LibExport VarAccess
  | Error RawVar PosInf                    -- already has it
  | StackExpand RawBBTree RawBBTree
  deriving (Eq, Show)

-- AFTER:
data RawTerminator
  = TailCall RawVar PosInf
  | Ret PosInf
  | If RawVar RawBBTree RawBBTree PosInf
  | LibExport VarAccess PosInf
  | Error RawVar PosInf
  | StackExpand RawBBTree RawBBTree PosInf
  deriving (Eq, Show)
```

### 3.3 IR2Raw.hs - Pass NoPos (for now)

```haskell
-- FILE: compiler/src/IR2Raw.hs

-- Update inst2raw to pass NoPos:
inst2raw :: IR.IRInst -> TM ()
inst2raw (IR.Assign vn expr) = do
    -- ... existing logic ...
    tell [AssignRaw r e NoPos]

inst2raw (IR.MkFunClosures envmap vars) = do
    tell [MkFunClosures envmap vars NoPos]

-- Update tr2raw for terminators:
tr2raw :: IR.IRTerminator -> TM Raw.RawTerminator
tr2raw (IR.TailCall fn arg) = do
    -- ... existing logic ...
    return $ Raw.TailCall r NoPos

tr2raw (IR.Ret va) = do
    -- ... existing logic ...
    return $ Raw.Ret NoPos

tr2raw (IR.If v bb1 bb2) = do
    -- ... existing logic ...
    return $ Raw.If r bb1' bb2' NoPos

tr2raw (IR.LibExport va) = return $ Raw.LibExport va NoPos

tr2raw (IR.StackExpand vn bb1 bb2) = do
    -- ... existing logic ...
    return $ Raw.StackExpand bb1' bb2' NoPos

-- Error already has position:
tr2raw (IR.Error verr pos) = do
    -- ... existing logic ...
    return $ Raw.Error r pos
```

### 3.4 Raw2Stack.hs - Thread position from Raw to Stack

```haskell
-- FILE: compiler/src/Raw2Stack.hs

-- Now update to thread positions from Raw:
trOneRegInst :: Raw.RawInst -> Tr [Stack.StackInst]
trOneRegInst i = do
  __offsets <- offsets <$> ask
  rel <- offsetWithCallDepth
  let store a pos =
          case Map.lookup a __offsets of
              Nothing -> []
              Just i ->  [Stack.StoreStack a (rel i) pos]
  case i of
    Raw.AssignRaw x e pos -> return $
      (Stack.AssignRaw Stack.AssignConst x e pos):(store (Raw.AssignableRaw x) pos)
    Raw.AssignLVal x e pos -> return $
      (Stack.AssignLVal x e pos):(store (Raw.AssignableLVal x) pos)
    Raw.SetState cmp x pos -> return [Stack.SetState cmp x pos]
    Raw.SetBranchFlag pos -> return [Stack.SetBranchFlag pos]
    Raw.InvalidateSparseBit pos -> return [Stack.InvalidateSparseBit pos]
    Raw.MkFunClosures envmap vars pos -> do
      let stores = concat $ map (\v -> store (Raw.AssignableLVal v) pos) (fst (unzip vars))
      return $ (Stack.MkFunClosures envmap vars pos):stores
    Raw.RTAssertion a pos -> return [Stack.RTAssertion a pos]

-- Update trTr:
trTr :: Raw.RawTerminator -> Tr Stack.StackTerminator
trTr (Raw.TailCall r pos) = return $ Stack.TailCall r pos
trTr (Raw.Ret pos) = return $ Stack.Ret pos
trTr (Raw.If r bb1 bb2 pos) = do
     bb1' <- trBB bb1
     bb2' <- trBB bb2
     return $ Stack.If r bb1' bb2' pos
trTr (Raw.LibExport v pos) = return $ Stack.LibExport v pos
trTr (Raw.Error r1 p) = return $ Stack.Error r1 p
trTr (Raw.StackExpand bb1 bb2 pos) = do
   bb1' <- trBB bb1
   bb2' <- trBB bb2
   return $ Stack.StackExpand bb1' bb2' pos
```

**Test**: Compile, verify no errors. Positions flow Raw->Stack->JS (but still NoPos).

---

## Phase 4: IR Instructions with Position (Backwards Compatible)

**Goal**: Add `PosInf` to IR types, thread from IR to Raw.

### 4.1 IR.hs - Add PosInf to IRInst

```haskell
-- FILE: compiler/src/IR.hs

-- BEFORE (lines 97-104):
data IRInst
  = Assign VarName IRExpr
  | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]
  deriving (Eq, Show, Generic)

-- AFTER:
data IRInst
  = Assign VarName IRExpr PosInf
  | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)] PosInf
  deriving (Eq, Show, Generic)
```

### 4.2 IR.hs - Add PosInf to IRTerminator

```haskell
-- FILE: compiler/src/IR.hs

-- BEFORE (lines 76-94):
data IRTerminator
  = TailCall VarAccess VarAccess
  | Ret VarAccess
  | If VarAccess IRBBTree IRBBTree
  | AssertElseError VarAccess IRBBTree VarAccess PosInf  -- already has it
  | LibExport VarAccess
  | Error VarAccess PosInf                               -- already has it
  | StackExpand VarName IRBBTree IRBBTree
  deriving (Eq,Show,Generic)

-- AFTER:
data IRTerminator
  = TailCall VarAccess VarAccess PosInf
  | Ret VarAccess PosInf
  | If VarAccess IRBBTree IRBBTree PosInf
  | AssertElseError VarAccess IRBBTree VarAccess PosInf
  | LibExport VarAccess PosInf
  | Error VarAccess PosInf
  | StackExpand VarName IRBBTree IRBBTree PosInf
  deriving (Eq,Show,Generic)
```

### 4.3 ClosureConv.hs - Pass NoPos (for now)

```haskell
-- FILE: compiler/src/ClosureConv.hs

-- Update instruction generation to pass NoPos:
-- (We'll thread real positions in Phase 6)

cpsToIR (CPS.LetSimple vname st kt) = do
    i <-
      let _assign arg = return $ Just $ CCIR.Assign vname arg NoPos in
      case st of
        CPS.Base base -> _assign $ Base base
        -- ... rest of cases use _assign which now includes NoPos ...

        CPS.ValSimpleTerm (CPS.KAbs klam) -> do
          freeVars <- transFunDec vname klam
          envBindings <- mkEnvBindings freeVars
          return $ Just $ CCIR.MkFunClosures envBindings [(vname, HFN ident)] NoPos
    -- ... rest unchanged

-- Update terminator generation with NoPos:
cpsToIR (CPS.LetRet (CPS.Cont arg kt') kt) = do
    t  <- cpsToIR kt
    t' <- local (insVar arg) (cpsToIR kt')
    return $ CCIR.BB [] $ StackExpand arg t t' NoPos

-- ... update all other terminator cases with NoPos
```

### 4.4 IR2Raw.hs - Thread position from IR to Raw

```haskell
-- FILE: compiler/src/IR2Raw.hs

-- Now thread positions from IR:
inst2raw :: IR.IRInst -> TM ()
inst2raw (IR.Assign vn expr pos) = do
    -- ... existing logic ...
    tell [AssignRaw r e pos]  -- pass through!

inst2raw (IR.MkFunClosures envmap vars pos) = do
    tell [MkFunClosures envmap vars pos]

-- Update tr2raw:
tr2raw :: IR.IRTerminator -> TM Raw.RawTerminator
tr2raw (IR.TailCall fn arg pos) = do
    -- ... existing logic ...
    return $ Raw.TailCall r pos

tr2raw (IR.Ret va pos) = do
    -- ... existing logic ...
    return $ Raw.Ret pos

tr2raw (IR.If v bb1 bb2 pos) = do
    -- ... existing logic ...
    return $ Raw.If r bb1' bb2' pos

tr2raw (IR.LibExport va pos) = return $ Raw.LibExport va pos

tr2raw (IR.StackExpand vn bb1 bb2 pos) = do
    -- ... existing logic ...
    return $ Raw.StackExpand bb1' bb2' pos

tr2raw (IR.Error verr pos) = do
    -- ... existing logic ...
    return $ Raw.Error r pos
```

**Test**: Compile, verify no errors. Positions flow IR->Raw->Stack->JS (but still NoPos).

---

## Phase 5: Fix Optimizations

**Goal**: Update pattern matches in optimization passes to handle new PosInf fields.

### 5.1 CPSOpt.hs - Fix constant folding

```haskell
-- FILE: compiler/src/CPSOpt.hs

-- Update locations that create literals with NoPos to use RTGen:
-- BEFORE (lines 311-312):
let ii f = _ret $ lit (C.LNumeric (NumInt (f n1 n2)) NoPos)

-- AFTER:
let ii f = _ret $ lit (C.LNumeric (NumInt (f n1 n2)) (RTGen "CPSOpt"))

-- BEFORE (lines 369-370):
(Basics.TupleLength, St (Tuple xs)) ->
    _ret $ lit (C.LNumeric (NumInt (fromIntegral (length xs))) NoPos)

-- AFTER:
(Basics.TupleLength, St (Tuple xs)) ->
    _ret $ lit (C.LNumeric (NumInt (fromIntegral (length xs))) (RTGen "CPSOpt"))

-- BEFORE (lines 372-373):
(Basics.ListLength, St (List xs)) ->
    _ret $ lit (C.LNumeric (NumInt (fromIntegral (length xs))) NoPos)

-- AFTER:
(Basics.ListLength, St (List xs)) ->
    _ret $ lit (C.LNumeric (NumInt (fromIntegral (length xs))) (RTGen "CPSOpt"))
```

### 5.2 IROpt.hs - Preserve positions when optimizing

```haskell
-- FILE: compiler/src/IROpt.hs

-- Update pattern matches to handle position and preserve it:
optimizeInst :: IR.IRInst -> Opt IR.IRInst
optimizeInst (IR.Assign vn expr pos) = do
    expr' <- optimizeExpr expr
    return $ IR.Assign vn expr' pos  -- preserve position

-- When creating new constants during partial evaluation, use RTGen:
-- BEFORE:
(NumericConst (NumInt c), Const (C.LNumeric (NumInt c) NoPos))

-- AFTER:
(NumericConst (NumInt c), Const (C.LNumeric (NumInt c) (RTGen "IROpt")))
```

### 5.3 RawOpt.hs - Update pattern matches

```haskell
-- FILE: compiler/src/RawOpt.hs

-- Update pattern matches to include and preserve position:
-- BEFORE:
pevalInst (AssignRaw x e) = do
  e' <- pevalExpr e
  return $ AssignRaw x e'

-- AFTER:
pevalInst (AssignRaw x e pos) = do
  e' <- pevalExpr e
  return $ AssignRaw x e' pos  -- position preserved

-- Apply same pattern to all instruction transformations
```

**Test**:
1. First test with `--no-rawopt` to verify positions work without optimizations
2. Then enable optimizations

---

## Phase 6: Thread Positions from CPS

**Goal**: Generate real positions in ClosureConv, completing the source map chain.

### 6.1 ClosureConv.hs - Extend CCEnv with position

```haskell
-- FILE: compiler/src/ClosureConv.hs

-- BEFORE (line 48):
type CCEnv = (CompileMode, C.Atoms, NestingLevel, Map VarName VarLevel, Maybe VarName)

-- AFTER:
type CCEnv = (CompileMode, C.Atoms, NestingLevel, Map VarName VarLevel, Maybe VarName, PosInf)

-- Add helper functions:
currentPos :: CC PosInf
currentPos = do
  (_, _, _, _, _, pos) <- ask
  return pos

withPos :: PosInf -> CC a -> CC a
withPos pos = local (\(cm, atoms, nl, vmap, fn, _) -> (cm, atoms, nl, vmap, fn, pos))

-- Update insVar (line 61-68):
insVar :: VarName -> CCEnv -> CCEnv
insVar vn (compileMode, atms, lev, vmap, fname, pos) =
    ( compileMode
    , atms
    , lev
    , Map.insert vn (VarNested lev) vmap
    , fname
    , pos  -- preserve position
    )

-- Update incLev (line 80-81):
incLev fname (compileMode, atms, lev, vmap, _, pos) =
    (compileMode, atms, lev + 1, vmap, (Just fname), pos)
```

### 6.2 ClosureConv.hs - Generate instructions with real positions

```haskell
-- FILE: compiler/src/ClosureConv.hs

-- Update cpsToIR to use currentPos:
cpsToIR (CPS.LetSimple vname@(VN ident) st kt) = do
    pos <- currentPos  -- Get current position
    i <-
      let _assign arg = return $ Just $ CCIR.Assign vname arg pos in
      case st of
        CPS.Base base -> _assign $ Base base
        -- ... rest of cases use _assign which now includes real pos ...

        CPS.ValSimpleTerm (CPS.KAbs klam) -> do
          freeVars <- transFunDec vname klam
          envBindings <- mkEnvBindings freeVars
          return $ Just $ CCIR.MkFunClosures envBindings [(vname, HFN ident)] pos
    -- ... rest uses pos

-- Update other cpsToIR cases:
cpsToIR (CPS.LetRet (CPS.Cont arg kt') kt) = do
    pos <- currentPos
    t  <- cpsToIR kt
    t' <- local (insVar arg) (cpsToIR kt')
    return $ CCIR.BB [] $ StackExpand arg t t' pos

-- ... update all terminator generation with currentPos
```

### 6.3 RetDFCPS.hs - Thread positions to CPS (if needed)

```haskell
-- FILE: compiler/src/RetDFCPS.hs

-- If CPS types need position info, add it here and thread from Core
-- This depends on how positions flow from Core -> CPS -> IR
```

**Test**: Compile with `--source-map`, verify `.map` file contains real mappings!

---

## Phase 7: Runtime Source Map Resolver

**Goal**: Runtime resolves source positions and includes them in error messages.

### 7.1 rt/package.json - Add dependency

```json
{
  "dependencies": {
    "source-map": "^0.7.4"
  }
}
```

### 7.2 SourceMapResolver.mts - Create module (NEW FILE)

```typescript
// FILE: rt/src/SourceMapResolver.mts (NEW FILE)

import { SourceMapConsumer } from 'source-map';
import * as fs from 'fs';
import * as path from 'path';

// Cache for loaded source map consumers
const consumers = new Map<string, SourceMapConsumer>();

/**
 * Get or create a SourceMapConsumer for a JS file
 */
async function getConsumer(jsFile: string): Promise<SourceMapConsumer | null> {
    // Check cache
    if (consumers.has(jsFile)) {
        return consumers.get(jsFile)!;
    }

    // Try to load source map
    const mapFile = jsFile + '.map';
    try {
        if (!fs.existsSync(mapFile)) {
            return null;
        }
        const rawMap = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
        const consumer = await new SourceMapConsumer(rawMap);
        consumers.set(jsFile, consumer);
        return consumer;
    } catch {
        return null;
    }
}

/**
 * Resolve a generated JS position to original source position
 */
export async function resolvePosition(
    jsFile: string,
    line: number,
    column: number
): Promise<string | null> {
    const consumer = await getConsumer(jsFile);
    if (!consumer) {
        return null;
    }

    const orig = consumer.originalPositionFor({ line, column });
    if (orig.source && orig.line) {
        return `${orig.source}:${orig.line}:${orig.column ?? 0}`;
    }
    return null;
}

/**
 * Find user code location by parsing current stack trace
 * This is the main entry point for error handlers
 */
export async function findUserCodeLocation(compiledJsPath: string): Promise<string | null> {
    // Create an error to capture the stack trace
    const err = new Error();
    const stack = err.stack || '';

    // Parse stack frames
    const frameRegex = /at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?/g;

    let match;
    while ((match = frameRegex.exec(stack)) !== null) {
        const [, file, line, col] = match;

        // Look for user's compiled JS (not node_modules, not runtime)
        if (file.endsWith('.js') && !file.includes('node_modules') && !file.includes('rt/built')) {
            const resolved = await resolvePosition(
                file.replace('file://', ''),
                parseInt(line),
                parseInt(col)
            );
            if (resolved) {
                return resolved;
            }
        }
    }
    return null;
}

/**
 * Cleanup consumers when done (call on process exit)
 */
export function destroyConsumers(): void {
    for (const consumer of consumers.values()) {
        consumer.destroy();
    }
    consumers.clear();
}
```

### 7.3 Thread.mts - Integrate resolver

```typescript
// FILE: rt/src/Thread.mts

import { findUserCodeLocation } from './SourceMapResolver.mjs';

class Thread {
    private compiledJsPath: string = '';

    /**
     * Set the path to the compiled JS file (called during initialization)
     */
    setCompiledPath(path: string): void {
        this.compiledJsPath = path;
    }

    /**
     * Throw a thread error with source location if available
     */
    async threadError(message: string): Promise<never> {
        let fullMessage = message;

        // Try to resolve source location
        if (this.compiledJsPath) {
            try {
                const loc = await findUserCodeLocation(this.compiledJsPath);
                if (loc) {
                    fullMessage += `\n | at ${loc}`;
                }
            } catch {
                // Source map resolution failed, continue without location
            }
        }

        console.error(`Error: ${fullMessage}`);
        throw new TroupeError(fullMessage);
    }

    // ... rest of Thread class unchanged
}
```

### 7.4 TroupeRuntimeInit.mts - Initialize resolver

```typescript
// FILE: rt/src/TroupeRuntimeInit.mts (or appropriate init file)

// During runtime initialization, set the compiled JS path:
import { destroyConsumers } from './SourceMapResolver.mjs';

// In initialization:
thread.setCompiledPath(compiledJsFile);

// On process exit:
process.on('exit', () => {
    destroyConsumers();
});
```

**Test**: Run a program that triggers an IFC error, verify source location appears in message.

---

## Phase 8: Direct Position Parameters (Optional Enhancement)

**Goal**: For compiler-emitted calls, pass position directly for immediate display.

### 8.1 Stack2JS.hs - Emit position to assertion calls

```haskell
-- FILE: compiler/src/Stack2JS.hs

-- When generating RTAssertion calls, include position:
ir2js (Stack.RTAssertion assertion pos) = do
  recordMapping pos
  let posStr = case pos of
        SrcPosInf f l c -> PP.doubleQuotes $ text $ f ++ ":" ++ show l ++ ":" ++ show c
        _ -> PP.doubleQuotes $ text ""
  return $ ppRTAssertionCodeWithPos assertion posStr

-- Add function to generate assertion call with position:
ppRTAssertionCodeWithPos :: RTAssertion -> PP.Doc -> PP.Doc
ppRTAssertionCodeWithPos assertion posDoc =
  -- Include position as last argument
  ppRTAssertionCode (\fn args -> ppFunCall fn (args ++ [posDoc])) assertion
```

### 8.2 Asserts.mts - Add position parameter

```typescript
// FILE: rt/src/Asserts.mts

// BEFORE:
export function assertIsNumber(x: any) {
    if (typeof x !== 'number') {
        _thread().threadError(`value ${pp(x)} is not a number`)
    }
}

// AFTER:
export function assertIsNumber(x: any, pos: string = '') {
    if (typeof x !== 'number') {
        const suffix = pos ? ` at ${pos}` : '';
        _thread().threadError(`value ${pp(x)} is not a number${suffix}`);
    }
}

// Apply same pattern to all assertions:
export function assertIsString(x: any, pos: string = '') { ... }
export function assertIsBoolean(x: any, pos: string = '') { ... }
export function assertIsFunction(x: any, pos: string = '') { ... }
export function assertIsLevel(x: any, pos: string = '') { ... }
export function assertIsAuthority(x: any, pos: string = '') { ... }
export function assertIsNTuple(x: any, n: number, pos: string = '') { ... }
// ... etc
```

### 8.3 BuiltinArith.mts - Add position to division

```typescript
// FILE: rt/src/builtins/BuiltinArith.mts

// BEFORE:
intdiv = mkBase((x) => {
    // ...
    if (divisor === 0) {
        this.runtime.$t.threadError('Division by zero error');
    }
    // ...
})

// AFTER:
intdiv = mkBase((x, pos = '') => {
    // ...
    if (divisor === 0) {
        const suffix = pos ? ` at ${pos}` : '';
        this.runtime.$t.threadError(`Division by zero error${suffix}`);
    }
    // ...
})
```

**Test**: Trigger a type error, verify message shows `at file:line:col` directly.

---

## Summary: Files Modified

### Compiler (Phases 0-6)

| Phase | File | Changes |
|-------|------|---------|
| 0 | `compiler/src/Parser.y` | ReaderT monad for filename |
| 0 | `compiler/app/Main.hs` | Pass filename to parser |
| 1 | `compiler/app/Main.hs` | Add `--source-map` flag |
| 1 | `compiler/troupe-compile.cabal` | Add `sourcemap >= 0.1.7` |
| 1 | `compiler/src/TroupeSourceMap.hs` | **NEW** - wrapper module |
| 2 | `compiler/src/Stack.hs` | Add PosInf to types |
| 2 | `compiler/src/Raw2Stack.hs` | Pass NoPos initially |
| 2 | `compiler/src/Stack2JS.hs` | Extend state, collect mappings |
| 3 | `compiler/src/Raw.hs` | Add PosInf to types |
| 3 | `compiler/src/IR2Raw.hs` | Pass NoPos initially |
| 3 | `compiler/src/Raw2Stack.hs` | Thread position |
| 4 | `compiler/src/IR.hs` | Add PosInf to types |
| 4 | `compiler/src/ClosureConv.hs` | Pass NoPos initially |
| 4 | `compiler/src/IR2Raw.hs` | Thread position |
| 5 | `compiler/src/CPSOpt.hs` | Fix NoPos in constant folding |
| 5 | `compiler/src/IROpt.hs` | Preserve positions |
| 5 | `compiler/src/RawOpt.hs` | Update pattern matches |
| 6 | `compiler/src/ClosureConv.hs` | Thread real positions |
| 6 | `compiler/src/RetDFCPS.hs` | Thread positions (if needed) |

### Runtime (Phases 7-8)

| Phase | File | Changes |
|-------|------|---------|
| 7 | `rt/package.json` | Add `source-map` dependency |
| 7 | `rt/src/SourceMapResolver.mts` | **NEW** - resolve positions |
| 7 | `rt/src/Thread.mts` | Integrate resolver |
| 7 | `rt/src/TroupeRuntimeInit.mts` | Initialize resolver |
| 8 | `rt/src/Asserts.mts` | Add pos parameter |
| 8 | `rt/src/builtins/BuiltinArith.mts` | Add pos parameter |

### Libraries Used

| Component | Library | Version | Purpose |
|-----------|---------|---------|---------|
| Compiler | `sourcemap` | >= 0.1.7 | V3 source map generation with VLQ |
| Runtime | `source-map` | ^0.7.4 | Parse and resolve source maps |
