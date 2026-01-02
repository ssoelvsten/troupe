{-- 
Translation from Stack to JS code.
The names of most runtime functions are specified at the respective place here.
However, those for 'RTAssertion' are defined via 'ppRTAssertion'.

TODO
- Port the code for serialization (AA; 2020-12-04)

--}

{-# LANGUAGE FlexibleInstances #-}
{-# LANGUAGE TypeSynonymInstances #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE LambdaCase #-}
module Stack2JS where
-- import qualified IR2JS 

import IR (SerializationUnit(..), HFN(..)
          , ppFunCall, ppArgs, Fields (..), Ident
          , serializeFunDef
          , serializeAtoms )
import qualified Data.ByteString.Lazy.Char8 as BL
import qualified IR
import qualified Raw

import Raw (RawExpr (..), RawType(..), RawVar (..), MonComponent(..), RTAssertion(..),
            ppRawExpr, ppRTAssertionCode)

import Stack

import qualified Basics
import           Basics(BinOp(..), UnaryOp(..))
import qualified Core as C
import           Core (ppLit)
import           RetCPS(VarName(..))
import qualified RetCPS as CPS
import           Control.Monad.RWS
import           Control.Monad.State
import           Control.Monad.Writer
import           Control.Monad.Reader
import           Data.List
import qualified Data.Text as T
import           Data.Text.Encoding
import           Data.ByteString.Lazy (ByteString)
import           Data.ByteString.Base64 (encode,decode)
import           CompileMode
import           TroupePositionInfo
import qualified Data.Aeson as Aeson
import           GHC.Generics (Generic)


import qualified Text.PrettyPrint.HughesPJ as PP
import Text.PrettyPrint.HughesPJ (
    (<+>), ($$), text, hsep, vcat, nest)
import Data.Aeson (ToJSON(toJSON), Value)
import DCLabels (dcLabelExpToDCLabel)
import Debug.Trace (trace, traceShow)
import SourceMap.Types (Mapping(..))
import TroupeSourceMap (collectMapping)


data LibAccess = LibAccess Basics.LibName Basics.VarName
   deriving (Eq, Show,Generic)

instance Aeson.ToJSON Basics.LibName
instance Aeson.ToJSON LibAccess

jsLoadLibs = vcat $ map text [
  "this.libSet = new Set ()",
  "this.libs = []",
  "this.addLib = function (lib, decl) { if (!this.libSet.has (lib +'.'+decl)) { this.libSet.add (lib +'.'+decl); this.libs.push ({lib:lib, decl:decl})} }" ]

addLibs xs = vcat $ nub (map addOneLib xs)
  where addOneLib (LibAccess (Basics.LibName libname) varname) =
          let args = (PP.doubleQuotes.PP.text) libname <+> text "," <+> (PP.doubleQuotes. PP.text) varname
          in text "this.addLib " <+> PP.parens args


data JSOutput = JSOutput { libs :: [LibAccess]
                         , fname:: Maybe String 
                         , code :: String 
                         , atoms :: [Basics.AtomName]
                         } deriving (Show, Generic)

instance Aeson.ToJSON JSOutput


data TheState = TheState { freshCounter :: Integer
                         , frameSize    :: Int
                         , sparseSlot   :: Int
                         , consts       :: Raw.Consts
                         , stHFN        :: IR.HFN
                         , markerCounter :: Int  -- Counter for source map markers
                         }

type RetKontText = PP.Doc

-- | Marker data: (marker ID, source position info)
type MarkerData = (Int, PosInf)

type WData = ([LibAccess], [Basics.AtomName], [RetKontText], [MarkerData])
type W = RWS Bool WData TheState


initState = TheState { freshCounter = 0
                     , frameSize = error "frameSize should not be accessed yet"
                     , sparseSlot = error "sparseSlot should not be accessed yet"
                     , consts = error "consts should not be accessed yet"
                     , stHFN = error "stHFN should not be accessed yet"
                     , markerCounter = 0
                     }

a $$+ b  = a $$ (nest 2 b)

-- | Check if a string contains only whitespace characters
isWhitespaceOnly :: String -> Bool
isWhitespaceOnly s = null s || all (\c -> c `elem` [' ', '\t', '\r']) s

-- | Emit a source map marker comment and record the mapping.
-- Returns a PP.Doc containing the marker comment, or empty if position is NoPos/RTGen.
emitMarker :: PosInf -> W PP.Doc
emitMarker pos = case pos of
  p@(SrcPosInf {}) -> do
    markerId <- gets markerCounter
    modify (\s -> s { markerCounter = markerId + 1 })
    tell ([], [], [], [(markerId, p)])
    return $ text ("/*SM:" ++ show markerId ++ "*/")
  _ -> return PP.empty

-- | Generate marker prefix for source positions.
-- Format: /*SM:123*/ where 123 is a unique marker ID
markerPrefix :: String
markerPrefix = "/*SM:"

markerSuffix :: String
markerSuffix = "*/"



class Identifier a where
  ppId :: a ->  PP.Doc


instance Identifier VarName where
  ppId = IR.ppVarName

-- instance Identifier IR.VarAccess where
--   ppId = IR.ppVarAccess

instance Identifier HFN where
  ppId (HFN n) = text n

instance Identifier Basics.LibName where 
  ppId (Basics.LibName s) = text s

instance Identifier Basics.AtomName where 
  ppId = text

instance Identifier RawVar where 
  ppId (RawVar x) = text x

instance Identifier Raw.Assignable where 
  ppId (Raw.AssignableRaw x) = ppId x 
  ppId (Raw.AssignableLVal x) = ppId x 
  ppId (Raw.Env) = text "$env"

-- | Translation monad collecting the generated JS parts when passing through the 'StackProgram' tree.
class ToJS a where
   toJS :: a -> W PP.Doc

stack2PPDoc :: CompileMode -> Bool -> StackUnit -> (PP.Doc, WData)

stack2PPDoc compileMode debugMode (ProgramStackUnit sp) =
  let (fns, _, w@(libs, atoms, konts, markers)) = runRWS (toJS sp) debugMode initState
      inner = vcat $
        [ jsLoadLibs
        , addLibs libs
        ]
        ++ (fns:konts) ++
        [ ]

      outer = ("function Top (rt)" <+> PP.lbrace)
        $$+ inner
        $$ PP.rbrace
        $$ PP.text "module.exports = Top"

      ppDoc = case compileMode of CompileMode.Library    -> inner
                                  _                      -> outer
  in (ppDoc, w)

stack2PPDoc _           debugMode su =
  let (inner, _, w@(libs, _, konts, markers)) = runRWS (toJS su) debugMode initState
      ppDoc = vcat $ [ addLibs libs ] ++ (inner:konts)
  in (ppDoc, w)


stack2JSString :: CompileMode -> Bool -> StackUnit -> String
stack2JSString compileMode debugMode su =
  let (ppDoc, _) = stack2PPDoc compileMode debugMode su
      rendered = PP.render ppDoc
      -- Remove lines that contain only whitespace
      cleanedLines = filter (not . isWhitespaceOnly) (lines rendered)
  in unlines cleanedLines

-- | Generate JS string and source map mappings
-- Returns (JS code with markers stripped, list of source map mappings)
stack2JSWithMappings :: CompileMode -> Bool -> StackUnit -> (String, [Mapping])
stack2JSWithMappings compileMode debugMode su =
  let (ppDoc, (_, _, _, markerData)) = stack2PPDoc compileMode debugMode su
      rendered = PP.render ppDoc
      -- processMarkers handles marker stripping and merging whitespace-only lines
      (cleanCode, mappings) = processMarkers rendered markerData
  in (cleanCode, mappings)

-- | Process markers in rendered output to generate source map mappings
-- Returns (code with markers stripped, list of mappings)
processMarkers :: String -> [MarkerData] -> (String, [Mapping])
processMarkers code markerData =
  let markerMap = markerData  -- List of (markerId, srcPos)
      -- Scan the code to find marker positions and build mappings
      (cleanLines, mappings) = scanLines (lines code) markerMap 1 [] []
  in (unlines' cleanLines, mappings)
  where
    -- Rejoin lines without adding trailing newline if original didn't have one
    unlines' [] = ""
    unlines' xs = intercalate "\n" xs

-- | Scan lines for markers and build mappings
-- Skips whitespace-only lines and tracks output line numbers separately
scanLines :: [String]      -- Lines to process
          -> [MarkerData]  -- Marker data (id, srcPos)
          -> Int           -- Current output line number (1-based)
          -> [String]      -- Accumulated clean lines
          -> [Mapping]     -- Accumulated mappings
          -> ([String], [Mapping])
scanLines [] _ _ accLines accMappings = (reverse accLines, reverse accMappings)
scanLines (line:rest) markerData outLineNum accLines accMappings =
  let (cleanLine, lineMappings) = processLine line markerData outLineNum
      shouldEmit = not (isWhitespaceOnly cleanLine && not (null rest))
      -- Increment output line number only if we emit this line
      nextLineNum = if shouldEmit then outLineNum + 1 else outLineNum
      -- Add line to output only if we're emitting it
      nextLines = if shouldEmit then (cleanLine:accLines) else accLines
  in scanLines rest markerData nextLineNum nextLines (lineMappings ++ accMappings)

-- | Process a single line, extracting markers and generating mappings
processLine :: String -> [MarkerData] -> Int -> (String, [Mapping])
processLine line markerData lineNum = go line 1 "" []
  where
    go :: String -> Int -> String -> [Mapping] -> (String, [Mapping])
    go [] _ acc mappings = (reverse acc, mappings)
    go s@(c:cs) col acc mappings
      | markerPrefix `isPrefixOf` s =
          case parseMarker s of
            Just (markerId, remaining) ->
              -- Found a marker, look up source position
              case lookup markerId markerData of
                Just srcPos ->
                  -- Create mapping: source position -> current output position
                  let newMapping = case collectMapping srcPos lineNum col of
                        Just m -> [m]
                        Nothing -> []
                  in go remaining col acc (newMapping ++ mappings)
                Nothing ->
                  -- Marker not found in data, skip it
                  go remaining col acc mappings
            Nothing ->
              -- Not a valid marker, include character
              go cs (col + 1) (c:acc) mappings
      | otherwise = go cs (col + 1) (c:acc) mappings

-- | Parse a marker from string, returning (markerId, remaining string) or Nothing
parseMarker :: String -> Maybe (Int, String)
parseMarker s
  | markerPrefix `isPrefixOf` s =
      let afterPrefix = drop (length markerPrefix) s
          (digits, afterDigits) = span isDigit afterPrefix
      in if not (null digits) && markerSuffix `isPrefixOf` afterDigits
         then Just (read digits, drop (length markerSuffix) afterDigits)
         else Nothing
  | otherwise = Nothing
  where
    isDigit c = c >= '0' && c <= '9'

stack2JSON :: CompileMode -> Bool -> StackUnit -> ByteString
stack2JSON compileMode debugMode su =
  let (ppDoc, (libs, atoms, konts, _markers)) = stack2PPDoc compileMode debugMode su
      fname = case su of FunStackUnit (Loc _ (FunDef (HFN n) _ _ _ _)) -> Just n
                         AtomStackUnit _                       -> Nothing
                         ProgramStackUnit _                    -> error "Internal error: stack2JSON called with ProgramStackUnit"
  in Aeson.encode $ JSOutput { libs = libs
                             , fname = fname
                             , atoms = atoms
                             , code = PP.render ppDoc
                             }


instance ToJS StackUnit where
  toJS (FunStackUnit lfdecl) = toJS lfdecl
  toJS (AtomStackUnit ca) = toJS ca
  toJS (ProgramStackUnit p) = error "not implemented"

-- | Instance for Located FunDef - extracts position and delegates to FunDef ToJS
instance ToJS LFunDef where
  toJS (Loc pos fdef) = toJSFunDefWithPos pos fdef

-- | Instance for Located StackInst - extracts position and delegates to ir2js
instance ToJS LStackInst where
  toJS (Loc pos inst) = ir2jsWithPos pos inst

-- | Instance for Located StackTerminator - extracts position and delegates to tr2js
instance ToJS LStackTerminator where
  toJS (Loc pos tr) = tr2jsWithPos pos tr

instance ToJS IR.VarAccess where 
  toJS (IR.VarLocal vn) = return $ IR.ppVarName vn 
  toJS (IR.VarEnv vn) = return $ text "$env." PP.<> (IR.ppVarName vn)
  toJS (IR.VarFunSelfRef) = do 
    HFN (fname) <- gets stHFN 
    return $ text fname 


instance ToJS StackProgram where
  toJS (StackProgram atoms funs) = do
     jjA <- toJS atoms
     jjF <- mapM toJS funs
     return $ vcat $ [jjA] ++ jjF


instance ToJS C.Atoms where
  toJS catoms@(C.Atoms atoms) = return $
    vcat [ vcat $ (map  (\a -> hsep ["const"
                                    , text a
                                    , "= new rt.Atom"
                                                  , (PP.parens ( (PP.doubleQuotes.text) a))]) atoms)
         , text "this.serializedatoms =" <+> (pickle.serializeAtoms) catoms]


jsonValueToString :: Value -> String
jsonValueToString val = BL.unpack (Aeson.encode val)

lit2JS C.LUnit = text "rt.__unitbase"
lit2JS (C.LLabel s) = text "rt.mkV1Label" <> (PP.parens . PP.doubleQuotes) (text s)
lit2JS (C.LDCLabel dc) = 
  text "rt.mkDCLabel" <> (PP.parens.text.jsonValueToString.toJSON.dcLabelExpToDCLabel) dc 

lit2JS lit = ppLit lit

constsToJS :: Raw.Consts -> W PP.Doc
constsToJS consts = do
     docs <- mapM toJsConst consts
     return $ vcat docs
  where
    toJsConst (x, lit) = do
      marker <- emitMarker (posInfo lit)
      return $ marker PP.<> hsep ["const", ppId x , text "=", lit2JS lit ]

-- | Helper function for FunDef ToJS with explicit position
toJSFunDefWithPos :: PosInf -> FunDef -> W PP.Doc
toJSFunDefWithPos pos (FunDef hfn stacksize consts bb irfdef) = do
       {--
          |  |  | ... | <sparse slot> |
          ^           ^
          |           |
          SP          stacksize

       --}
       let _frameSize = stacksize + 1

       modify (\s -> s { frameSize = _frameSize, sparseSlot = stacksize, stHFN = hfn, consts = consts } ) -- + 1 for the sparse flag; 2021-03-17; AA
       lits <- constsToJS consts
       jj <- toJS bb
       debug <- ask
       let (irdeps, libdeps, _atomdeps) = IR.ppDepsAsJSON irfdef
       sparseSlotIdxPP <- ppSparseSlotIdx
       -- Emit source map marker for function definition
       marker <- emitMarker pos

       return $
          vcat [marker PP.<> text "this." PP.<> ppId hfn <+> text "=" <+> ppArgs ["$env"] <+> text "=> {"
               , if debug then nest 2 $ text "rt.debug" <+> (PP.parens . PP.doubleQuotes.  ppId) hfn
                          else PP.empty
               , nest 2 $ vcat $ [
                  "let _T = rt.runtime.$t",
                  "let _STACK = _T.callStack",
                  "let _SP = _T._sp",
                  "let _SP_OLD",
                  -- Update sparse bit at function entry:
                  -- Check whether environment's data level, and the label and data level of R0 are bound by PC.
                  -- Requires sparseSlot to be updated first.
                  "_T.sparseSlot = " <+> sparseSlotIdxPP,
                  "_T.updateSparseBitOnEntry($env.__dataLevel)",
                  lits,
                  jj]
               , text "}"
               , semi $ text "this." PP.<> ppId hfn PP.<> text ".deps =" <+> irdeps
               , semi $ text "this." PP.<> ppId hfn PP.<> text ".libdeps =" <+> libdeps
               , semi $ text "this." PP.<> ppId hfn PP.<> text ".serialized =" <+> (pickle.serializeFunDef) irfdef
               , semi $ text "this." PP.<> ppId hfn PP.<> text ".framesize =" <+> (PP.int stacksize) ]



instance ToJS StackBBTree where
--  toJS = bb2js

    toJS (BB ins tr) = do
      jj  <- mapM toJS ins
      j'  <- toJS tr
      return $ vcat $ jj ++ [j']


-- These instances are not used directly since StackBBTree now has Located types,
-- but we keep them for cases where the unwrapped types might be used elsewhere.
instance ToJS StackInst where
  toJS = ir2jsWithPos NoPos

instance ToJS StackTerminator where
  toJS = tr2jsWithPos NoPos

binOpToJS :: BinOp -> Raw.UseNativeBinop ->  String
binOpToJS op (Raw.UseNativeBinop isNative) = case op of 
    -- JS binary operators (some not implemented in IR2Raw)
    Plus -> "+"
    Minus -> "-"
    Mult -> "*"
    Div -> "/"
    Mod -> "%"
    Le -> "<="
    Lt -> "<"
    Ge -> ">="
    Gt -> ">"
    And -> "&&"
    Or -> "||"
    BinAnd -> "&"
    BinOr -> "|"
    BinXor -> "^"
    BinShiftLeft -> "<<"
    BinShiftRight -> ">>"
    BinZeroShiftRight -> ">>>"
    -- Functions defined in UserRuntimeZero.ts
    IntDiv -> "rt.intdiv"
    Eq -> if isNative then "===" else "rt.eq"
    Neq -> if isNative then "!==" else "rt.neq"
    Concat -> "+"
    HasField -> "rt.hasField"
    LatticeJoin -> "rt.raw_join"
    -- No RT operations (should be moved to a different datatype)
    RaisedTo -> error "Not a runtime operation"
    -- Not yet implemented in IR2Raw
    FlowsTo -> error "Not yet implemented: FlowsTo" -- (implemented in tagsets.ts: "rt.flowsTo")
    LatticeMeet -> error "Not yet implemented: LatticeMeet"

unaryOpToJS :: UnaryOp -> String
unaryOpToJS = \case
    -- Functions defined in UserRuntimeZero.ts
    IsTuple -> "rt.raw_istuple"
    IsList -> "rt.raw_islist"
    IsRecord -> "rt.isRecord"
    -- Note: Currently lists and tuples are both using the same RT length function.
    ListLength -> "rt.raw_listLength"
    TupleLength -> "rt.raw_tupleLength"
    RecordSize -> "rt.raw_recordSize"
    Head -> "rt.head"
    Tail -> "rt.tail"
    UnMinus -> "-"
    Not -> "!"
    -- Not yet implemented in IR2Raw
    Fst -> error "Not yet implemented: Fst"
    Snd -> error "Not yet implemented: Snd"
    LevelOf -> error "Not yet implemented: LevelOf" -- (implemented in levelops.ts: "rt.levelOf")

{-- INSTRUCTIONS --}


-- omit _ = PP.empty

-- | Translate StackInst to JS with explicit position
ir2jsWithPos :: PosInf -> StackInst -> W PP.Doc
ir2jsWithPos pos (AssignRaw tt vn e) = do
  marker <- emitMarker pos
  jj <- toJS e
  let pfx = case tt of
               AssignConst -> text "const"
               AssignLet   -> text "let"
               AssignMut   -> PP.empty
  return $ marker PP.<> semi (pfx <+> ppId vn <+> text "=" <+> jj)

-- Note: Technically this is handled in the same way as 'AssignRaw' (with 'AssignConst'),
-- because in JS it is just an assignment to a variable.
-- The only difference to AssignRaw is the type of variable name (here 'VarName', there 'RawVar') (even though both are wrappers for String)
ir2jsWithPos pos (AssignLVal vn cexpr) = do
  marker <- emitMarker pos
  d <- toJS cexpr
  return $ marker PP.<> semi (ppLet vn <+> d)


ir2jsWithPos _pos (FetchStack x i) = return $
   ppLet x <+> text "_STACK[ _SP + " PP.<> text (show i) PP.<> text "]"

ir2jsWithPos _pos (StoreStack x i) = return $
   text "_STACK[ _SP + " PP.<> text (show i) PP.<> text "] = " <+> ppId x


ir2jsWithPos pos (MkFunClosures envBindings funBindings) = do
    -- Create new environment
    marker <- emitMarker pos
    env <- freshEnvVar
    dd_env_ids <- ppEnvIds env envBindings
    let ppEnv = vcat [ marker PP.<> semi (hsep [ ppLet env
                                   , text "new rt.Env()"])
                     , dd_env_ids]
    let ppFF = map (\(v, f) -> jsClosure v env f) funBindings
    return $ vcat (ppEnv : ppFF)

       where ppEnvIds :: VarName ->  [(VarName, IR.VarAccess)] -> W PP.Doc
             ppEnvIds env ls = do
               let penv = ppId env
               d1 <- mapM (\(a,b) -> do
                                  d_b <- toJS b
                                  return $ semi $ penv PP.<> text "." PP.<> (ppId a) <+> text "=" <+> d_b
                          )
                          ls
               d3 <- mapM (\(_, b) -> do
                              d_b <- toJS b
                              return $ d_b <> text ".dataLevel") ls
               let d2 = penv PP.<> text ".__dataLevel = "
                        <+> jsFunCall (text $ binOpToJS Basics.LatticeJoin (Raw.UseNativeBinop False)) d3

               return $ vcat ( d1 ++ [d2])
             hsepc ls = semi $ PP.hsep (PP.punctuate (text ",") ls)


ir2jsWithPos _pos (SetState c x) = return $ semi $ monStateToJs c <+> "=" <+> ppId x

ir2jsWithPos _pos (RTAssertion a) = return $ ppRTAssertionCode jsFunCall a

-- Note: LabelGroup now contains [LStackInst] (Located instructions)
ir2jsWithPos _pos (LabelGroup lii) = do
  ii' <- mapM ppLevelOp lii
  sparseSlot <- ppSparseSlot
  return $ vcat $
           [ -- "if (! _T.getSparseBit()) {" -- Alternative, but involves extra call to RT
             "if (!" <+> sparseSlot <+> ") {"
           , nest 2 (vcat ii')
           , text "}"
           ]
    where ppLevelOp (Loc _p (AssignRaw tt vn e)) = do
            jj <- toJS e
            let pfx = if tt == AssignConst then text "const" else PP.empty
            return $ semi $ pfx <+> ppId vn <+> text "=" <+> jj
          ppLevelOp lx = toJS lx  -- Delegate to LStackInst instance

ir2jsWithPos _pos SetBranchFlag = return $
  text "_T.setBranchFlag()"
ir2jsWithPos _pos InvalidateSparseBit = return $
  text "rt.raw_invalidateSparseBit()"

-- | Source position annotation: emit marker to track variable position in source maps
-- These track where variables end up after optimization/transformation
ir2jsWithPos pos (SourcePosAnnotation _r) = do
  marker <- emitMarker pos
  -- Return the marker - it will be on its own line but processMarkers will handle merging
  return marker



-- ir2js x = error $ "ir instruction translation not implemented: " ++ (show x)


{-- TERMINATORS --}

-- | Translate StackTerminator to JS with explicit position
tr2jsWithPos :: PosInf -> StackTerminator -> W PP.Doc
tr2jsWithPos _pos (StackExpand bb bb2) = do
    _frameSize <- gets frameSize
    _sparseSlot <- gets sparseSlot
    _consts <- gets consts
    modify (\s -> s {frameSize = 0, sparseSlot = _sparseSlot - _frameSize - 5})
        -- AA; 2021-04-24; Because
    js <- toJS bb
    modify (\s -> s { frameSize = _frameSize, sparseSlot = _sparseSlot })
        -- TODO: AA; 2021-04-24; we should really be using a reader monad here for frame size
        -- #codedebt
    js2 <- toJS bb2
    kname <- freshKontName
    sparseSlotIdxPP <- ppSparseSlotIdx
    constsJS <- constsToJS _consts  -- 2021-05-18; TODO: optimize by including only the _used_ constants
    let jsKont =
           vcat ["this." PP.<> ppId kname <+> text "= () => {",
                  nest 2 $
                        vcat [
                          "let _T = rt.runtime.$t",
                          "let _STACK = _T.callStack",
                          "let _SP = _T._sp",
                          -- TODO Do we need this? It seems to be only used zero or one time in the generated places.
                          -- So we could instead just use the let where it is actually set.
                          "let _SP_OLD",
                          -- Check data bound at return point (could have received labelled information or raised).
                          -- Requires sparseSlot to be updated first.
                          "_T.sparseSlot =" <+> sparseSlotIdxPP,
                          "_T.updateSparseBitOnReturn()",
                          constsJS,
                          js2
                        ],
                    "}"
                    -- debug support; 2021-04-24; AA
                    , "this." PP.<> ppId kname PP.<> text ".debugname = \"" PP.<> ppId kname PP.<> "\""
                    ]


    tell ([], [], [jsKont], [])
    return $ vcat [
      "_SP_OLD = _SP; ", -- 2021-04-23; hack ! ;AA
      "_SP = _SP + " <+> text (show (_frameSize + 5)) <+> ";",
      "_STACK[_SP - 5] = _SP_OLD;",
      "_STACK[_SP - 4] = _T.pc;",
      "_STACK[_SP - 3] = this." PP.<> ppId kname,
      "_STACK[_SP - 2] = _T.mailbox.mclear;",
      "_STACK[_SP - 1] = false;",
      "_T._sp = _SP;",
      js
      ]
  --  return $ jsFunCall (text "_T.pushFrame") [ text "this." PP.<> ppId kname, (text.show) _frameSize ] $$ js




tr2jsWithPos pos (If va bb1 bb2) = do
  marker <- emitMarker pos
  js1 <- toJS bb1
  js2 <- toJS bb2
  return $
    vcat [
      -- jsFunCall (text "rt.branch") [ppId va],
      marker PP.<> text "if" <+> PP.parens ( ppId va) <+> text "{",
      nest 2 js1,
      text "} else {",
      nest 2 js2,
      text "}"
    ]



tr2jsWithPos _pos Ret = return $
  jsFunCall (text "return _T.returnImmediate") []

tr2jsWithPos pos (Error va) = do
  marker <- emitMarker pos
  return $ marker PP.<> (jsFunCall (text "rt.rawErrorPos")) [ppId va, ppPosInfo pos]

tr2jsWithPos pos (TailCall va1) = do
  marker <- emitMarker pos
  return $ marker PP.<> ("return" <+> ppId va1)

tr2jsWithPos _pos (LibExport va) = do
  d <- toJS va
  return $ jsFunCall (text "return") [d]


monStateToJs c = 
  text "_T." PP.<>
      case c of 
        MonPC -> text "pc"
        MonBlock -> text "bl"
        R0_Val -> text "r0_val"
        R0_Lev -> text "r0_lev"
        R0_TLev -> text "r0_tlev"


ppSparseSlotIdx :: W PP.Doc
ppSparseSlotIdx = do
  s <- gets sparseSlot
  return $ text "_SP + " PP.<+> PP.int s

ppSparseSlot :: W PP.Doc 
ppSparseSlot = do    
   idx <- ppSparseSlotIdx
   return $ text "_STACK[ "  PP.<> idx PP.<> text "]"

-----------------------------------------------------------


fieldToJS :: ToJS a => (String, a) -> W PP.Doc
fieldToJS (f, v) = do 
    d <- toJS v 
    return $ PP.brackets $ PP.doubleQuotes (text f) <> text "," <> d

fieldsToJS :: ToJS a => [(String, a)] -> W [PP.Doc]
fieldsToJS fs = do 
    dd <- mapM fieldToJS fs 
    return $ PP.punctuate (text ",") dd

instance ToJS RawExpr where
  toJS x = do 
    HFN (fname) <- gets stHFN
    let ppFunSelfRef = text "$env." PP.<> ppId fname 
    let ppVarName IR.VarFunSelfRef = ppFunSelfRef
        ppVarName x = IR.ppVarAccess x
        
    case x of 
      ProjectState c -> return $ monStateToJs c
      ProjectLVal IR.VarFunSelfRef lf -> return (
        case lf of 
           Raw.FieldValue ->  ppFunSelfRef PP.<> 
                                text "." PP.<> PP.text (show Raw.FieldValue)
           Raw.FieldValLev -> monStateToJs MonPC
           Raw.FieldTypLev -> monStateToJs MonPC)
      e@(ProjectLVal _ _) -> return $ ppRawExpr e
      Bin binop use_native va1 va2 -> return $
        let text' = text (binOpToJS binop use_native) in
          if isInfixBinop binop use_native
          then hsep [ ppId va1, text', ppId va2 ]
          else jsFunCall text' [ppId va1, ppId va2]
      Un op v -> return $ text (unaryOpToJS op) <> PP.parens (ppId v)
      Tuple vars -> return $
        text "rt.mkTuple" <> PP.parens (PP.brackets $ PP.hsep $ PP.punctuate (text ",") (map ppVarName vars))
      Record fields -> do
        jsFields <- fieldsToJS fields 
        return $
          PP.parens $ text "rt.mkRecord" <> PP.parens (PP.brackets $ PP.hsep $ jsFields )
      WithRecord r fields -> do 
        jsFields <- fieldsToJS fields 
        return $
          text "rt.withRecord" <> PP.parens (
            PP.hsep [ppId r, text ",", PP.brackets $ PP.hsep $ jsFields ])
      ProjField x f -> return $
        text "rt.getField" <> PP.parens (ppId x <> text "," <>  PP.doubleQuotes (text f ) )
      ProjIdx x idx -> return $
        text "rt.raw_indexTuple" <> PP.parens (ppId x <> text "," <>  text (show idx) )
      List vars -> return $
        PP.parens $   text "rt.mkList" <> PP.parens (PP.brackets $ PP.hsep $ PP.punctuate (text ",") (map ppVarName vars))
      ListCons v1 v2 -> return $
        text "rt.cons" <>  PP.parens (ppVarName v1 <> text "," <> ppId v2)
      Const C.LUnit -> return $ text "rt.__unitbase"
      Const (C.LLabel s) -> return $
        text "rt.mkV1Label" <> (PP.parens . PP.doubleQuotes) (text s)
      Const lit -> do
        case lit of
          C.LAtom atom -> tell ([], [atom], [], [])
          _ -> return ()
        return $ ppLit lit
      Lib lib'@(Basics.LibName libname) varname -> do
        tell ([LibAccess lib' varname], [], [], [])
        return $
          text "rt.loadLib" <> PP.parens ((PP.doubleQuotes.text) libname <> text ", " <> (PP.doubleQuotes.text) varname <> text ", this")
      ConstructLVal r1 r2 r3 -> return $
        ppFunCall  (text "rt.constructLVal")  (map ppId [r1,r2,r3])
      Base b -> return $ text "rt." <+> text b -- Note: The "$$authorityarg" case is handled in IR2Raw




-----------------------------------------------------------
ppPosInfo :: GetPosInfo a => a -> PP.Doc 
ppPosInfo  = PP.doubleQuotes . text . show . posInfo

pickle = PP.doubleQuotes.text.T.unpack.decodeUtf8.encode

jsClosure var env f =
     vcat [ ppLet var <+> ((text "rt.mkVal") <> (PP.parens ((text "rt.RawClosure") <> (PP.parens (PP.hsep $ PP.punctuate "," [ppId env, text "this", text "this." PP.<> ppId f])))))
          , semi $ ppId env PP.<> PP.text "." PP.<> (ppId var ) <+> PP.text "=" <+> ppId var
          , semi $ ppId env PP.<> PP.text "." PP.<> (ppId var ) PP.<> text ".selfpointer = true"
          ]

ppLet x =  text "const" <+> ppId x <+> text "="

semi t = t PP.<> text ";"
jsFunCall a b = semi $ ppFunCall a b


freshEnvVar :: W VarName
freshEnvVar = do
    k <- gets freshCounter
    modify (\s -> s { freshCounter = k + 1  } )
    return $ VN  $ "$$$env" ++ (show k)


freshKontName :: W VarName
freshKontName = do
    j <- gets freshCounter
    HFN s <- gets stHFN
    modify (\s -> s { freshCounter = j + 1})
    return $ VN $  "$$$" ++ s ++ "$$$kont" ++ (show j)


isInfixBinop :: Basics.BinOp -> Raw.UseNativeBinop -> Bool
isInfixBinop op (Raw.UseNativeBinop use_native) = case op of 
  -- Infix
  Plus -> True
  Minus -> True
  Mult -> True
  Div -> True
  Mod -> True
  Le -> True
  Lt -> True
  Ge -> True
  Gt -> True
  And -> True
  Or -> True
  Concat -> True
  BinAnd -> True
  BinOr -> True
  BinXor -> True
  BinShiftLeft -> True
  BinShiftRight -> True
  BinZeroShiftRight -> True
  -- Flag dependent 
  Eq -> use_native
  Neq -> use_native 
  -- Not infix
  RaisedTo -> False
  FlowsTo -> False
  IntDiv -> False
  HasField -> False
  LatticeJoin -> False
  LatticeMeet -> False
