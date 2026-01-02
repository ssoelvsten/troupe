{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DefaultSignatures #-}
{-# LANGUAGE PatternSynonyms #-}
{-# LANGUAGE TypeSynonymInstances #-}
{-# LANGUAGE FlexibleInstances #-}


module Core (   Lambda (..)
              , Term (..)
              , LTerm
              , Decl (..)
              , LDecl
              , FunDecl (..)
              , LFields
              , Numeric(..)
              , Lit(..)
              , litEq
              , litNeq
              , AtomName
              , Atoms(..)
              , Prog(..)
              , VarAccess(..)
              , lowerProg
              , renameProg
              , ppLit
              )
where
import GHC.Generics(Generic)
import Data.Serialize (Serialize)

import qualified Data.Ord 
import           Basics
import qualified DirectWOPats as D
import qualified Data.Map.Strict as Map
import qualified Data.Set as Set
import           Control.Monad
import           Control.Monad.State.Lazy as State
import           Control.Monad.RWS
import           Control.Monad.Except

import qualified Text.PrettyPrint.HughesPJ as PP
import           Text.PrettyPrint.HughesPJ (
   (<+>), ($$), text, hsep, vcat, nest, nest)
import           ShowIndent

import           TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, atLoc, PosInf(..), GetPosInfo(..))
import           DCLabels (DCLabelExp, ppDCLabelExpLit, dcLabelEq, v1LabelEq, v1LabelToDCLabelExp)

--------------------------------------------------
-- AST is the same as Direct, but lambda are unary (or nullary)

-- | Located type aliases
type LTerm = Located Term
type LDecl = Located Decl
type LFields = [(FieldName, LTerm)]

data Lambda = Unary VarName PosInf LTerm  -- Keep PosInf for argument position
            | Nullary LTerm
  deriving (Eq)

data Decl
    = ValDecl VarName LTerm
    | FunDecs [FunDecl]
  deriving (Eq )

data FunDecl = FunDecl VarName Lambda PosInf  -- Keep PosInf for function definition position
  deriving (Eq)

-- Numeric type represents integer and floating point numeric literals
-- with cross-type equality (NumInt 3 == NumFloat 3.0)
data Numeric = NumInt Integer | NumFloat Double
  deriving (Show, Generic)
instance Serialize Numeric
instance Eq Numeric where
  (NumInt x) == (NumInt y) = x == y
  (NumFloat x) == (NumFloat y) = x == y
  (NumInt x) == (NumFloat y) = fromInteger x == y
  (NumFloat x) == (NumInt y) = x == fromInteger y
instance Ord Numeric where
  compare (NumInt x) (NumInt y) = compare x y
  compare (NumFloat x) (NumFloat y) = compare x y
  compare (NumInt x) (NumFloat y) = compare (fromInteger x) y
  compare (NumFloat x) (NumInt y) = compare x (fromInteger y)

data Lit
    = LNumeric Numeric PosInf
    | LString String
    | LLabel String
    | LDCLabel DCLabelExp
    | LUnit
    | LBool Bool
    | LAtom AtomName
  deriving (Show, Generic)
instance Serialize Lit
instance Eq Lit where
  (LNumeric n1 _) == (LNumeric n2 _) = n1 == n2
  (LString s) == (LString s') = s == s'
  (LLabel l) == (LLabel l') = l == l'
  LUnit == LUnit = True
  (LBool x) == (LBool y) = x == y
  (LAtom x) == (LAtom y) = x == y
  (LDCLabel dc) == (LDCLabel dc') = dc == dc'
  _ == _ = False
instance Ord Lit where
  compare (LNumeric n1 _) (LNumeric n2 _) = compare n1 n2
  compare (LString x) (LString y) = compare x y
  compare (LLabel x) (LLabel y) = compare x y
  compare LUnit LUnit = EQ
  compare (LBool x) (LBool y) = compare x y
  compare (LAtom x) (LAtom y) = compare x y
  compare (LDCLabel x) (LDCLabel y) = compare x y
  -- Cross-type ordering (for canonical ordering of different literal types)
  compare (LNumeric _ _) _ = LT
  compare _ (LNumeric _ _) = GT
  compare (LString _) _ = LT
  compare _ (LString _) = GT
  compare (LLabel _) _ = LT
  compare _ (LLabel _) = GT
  compare LUnit _ = LT
  compare _ LUnit = GT
  compare (LBool _) _ = LT
  compare _ (LBool _) = GT
  compare (LAtom _) _ = LT
  compare _ (LAtom _) = GT

instance GetPosInfo Lit where
  posInfo (LNumeric _ p) = p
  posInfo _ = NoPos

-- | Semantic equality for literals, handling label normalization
-- This is used for compile-time constant folding to ensure that
-- semantically equivalent labels (e.g., `{alice, bob}` and `{bob, alice}`)
-- are treated as equal.
litEq :: Lit -> Lit -> Bool
litEq (LNumeric n1 _) (LNumeric n2 _) = n1 == n2
litEq (LString s) (LString s') = s == s'
litEq (LLabel l) (LLabel l') = v1LabelEq l l'
litEq LUnit LUnit = True
litEq (LBool x) (LBool y) = x == y
litEq (LAtom x) (LAtom y) = x == y
litEq (LDCLabel dc) (LDCLabel dc') = dcLabelEq dc dc'
-- Cross-syntax comparison: V1 labels vs DC labels
litEq (LLabel l) (LDCLabel dc) = dcLabelEq (v1LabelToDCLabelExp l) dc
litEq (LDCLabel dc) (LLabel l) = dcLabelEq dc (v1LabelToDCLabelExp l)
litEq _ _ = False

-- | Semantic inequality for literals
litNeq :: Lit -> Lit -> Bool
litNeq x y = not (litEq x y)

-- Old Fields type kept for backward compatibility in pretty printing
type Fields = [(FieldName, Term)]

data VarAccess
    -- | A normal variable
    = RegVar VarName
    -- | Referring to a definition from a library
    | LibVar LibName VarName
    -- | A predefined name (e.g. send, receive)
    | BaseName VarName
 deriving (Eq)

-- | Core Term without embedded positions - positions are in Located wrapper
data Term
    = Lit Lit
    | Var VarAccess
    | Abs Lambda
    | App LTerm LTerm
    | Let Decl LTerm
    | If LTerm LTerm LTerm
    | AssertElseError LTerm LTerm LTerm
    | Tuple [LTerm]
    | Record LFields
    | WithRecord LTerm LFields
    | ProjField LTerm FieldName
    | ProjIdx LTerm Word
    | List [LTerm]
    | ListCons LTerm LTerm
    | Bin BinOp LTerm LTerm
    | Un UnaryOp LTerm
    | Error LTerm
  deriving (Eq)


data Atoms = Atoms [AtomName]
  deriving (Eq, Show, Generic)
instance Serialize Atoms


data Prog = Prog Imports Atoms LTerm
  deriving (Eq, Show)

-- Note: GetPosInfo instance for LTerm comes from TroupePositionInfo's
-- instance GetPosInfo (Located a) which extracts position from Loc wrapper


{--

This module defines the Core front-level intermediate representation,
and includes two phases of the compilation pipeline that involve that
representation.

1. Lowering of the program from the direct representation into the
Core representation

2. α-renaming and library name resolution. This is done in the Core
representation.

The module also contains pretty printing for the Core representation.


--}


--------------------------------------------------
-- 1. Lowering
--------------------------------------------------

lowerProg (D.Prog imports atms term) = Prog imports (transAtoms atms) (lower term)



-- the rest of the declarations in this part are not exported

transAtoms :: D.Atoms -> Atoms
transAtoms (D.Atoms atms) = Atoms atms

-- | Lower a lambda, producing Located terms for nested abstractions
lowerLam :: D.Lambda -> Lambda
lowerLam (D.Lambda vs t) =
  case vs of
    [] -> Unary "$unit" NoPos (lower t)
    (x, xpos):xs -> Unary x xpos (foldr (\(x', xpos') b -> Loc (posInfo t) (Abs (Unary x' xpos' b))) (lower t) xs)

lowerLit :: D.Lit -> Lit
lowerLit (D.LNumeric n pi) = LNumeric (lowerNumeric n) pi
  where
    lowerNumeric (D.NumInt i) = NumInt i
    lowerNumeric (D.NumFloat f) = NumFloat f
lowerLit (D.LString s) = LString s
lowerLit (D.LLabel s) = LLabel s
lowerLit (D.LDCLabel dc) = LDCLabel dc
lowerLit D.LUnit = LUnit
lowerLit (D.LBool b) = LBool b
lowerLit (D.LAtom n) = LAtom n

-- | Lower DirectWOPats.Term to Located Core.Term
lower :: D.Term -> LTerm
lower (D.Lit l) = Loc (litPos l) (Lit (lowerLit l))
  where
    -- Extract position from DirectWOPats literal (only LNumeric has position)
    litPos (D.LNumeric _ pi) = pi
    litPos _ = NoPos
lower (D.Error t p) = Loc p (Error (lower t))
lower (D.Var v pi) = Loc pi (Var (RegVar v))
  -- 2018-07-01: AA: note that we are mapping all vars to RegVar at
  -- this stage. This is a bit of a hack. A cleaner apporach is to
  -- have a separate intermediate representation. For now we save on
  -- the engineering effort and proceed like this, because at the
  -- subsequent phase (renaming) we resolve which names are base
  -- names, which are lib names, and which are actually just regular
  -- variables.

lower (D.Abs lam pi) = Loc pi (Abs (lowerLam lam))

lower (D.App e [] pi) = Loc pi (Core.App (lower e) (Loc NoPos (Lit LUnit))) -- does this form even exist?
lower (D.App e es pi) = foldl (\acc t -> Loc pi (Core.App acc (lower t))) (lower e) es
lower (D.Let decls e pi) =
  foldr (\decl t -> Loc pi (Let (lowerDecl decl) t)) (lower e) decls
  where lowerDecl (D.ValDecl vname e') = ValDecl vname (lower e')
        lowerDecl (D.FunDecs decs) = FunDecs (map lowerFun decs)
        lowerFun  (D.FunDecl v lam pos) = FunDecl v (lowerLam lam) pos
-- lower (D.Case t patTermLst) = Case (lower t) (map (\(p,t) -> (lowerDeclPat p, lower t)) patTermLst)
lower (D.If e1 e2 e3 pi) = Loc pi (If (lower e1) (lower e2) (lower e3))
lower (D.AssertElseError e1 e2 e3 p) = Loc p (AssertElseError (lower e1) (lower e2) (lower e3))
lower (D.Tuple terms pi) = Loc pi (Tuple (map lower terms))
lower (D.Record fields pi) = Loc pi (Record (map (\(f, t) -> (f, lower t)) fields))
lower (D.WithRecord e fields pi) = Loc pi (WithRecord (lower e) (map (\(f, t) -> (f, lower t)) fields))
lower (D.ProjField t f pi) = Loc pi (ProjField (lower t) f)
lower (D.ProjIdx t idx pi) = Loc pi (ProjIdx (lower t) idx)
lower (D.List terms pi) = Loc pi (List (map lower terms))
lower (D.ListCons t1 t2 pi) = Loc pi (ListCons (lower t1) (lower t2))

-- special casing shortcutting semantics; 2018-03-06;
lower (D.Bin And e1 e2 pi) = lower (D.If e1 e2 (D.Lit (D.LBool False)) pi)
lower (D.Bin Or e1 e2 pi) = lower (D.If e1 (D.Lit (D.LBool True)) e2 pi)
lower (D.Bin op e1 e2 pi) = Loc pi (Bin op (lower e1) (lower e2))
lower (D.Un op e pi) = Loc pi (Un op (lower e))


--------------------------------------------------
-- 2. α-RENAMING
--------------------------------------------------


-- This is the only function that is exported here

renameProg :: Prog -> Except String Prog
renameProg (Prog imports (Atoms atms) term) =
  let alist = map (\ a -> (a, a)) atms
      initEnv    = Map.fromList alist
      initReader = mapFromImports imports
      initState  = 0
  in do
      (term', _, _) <- runRWST (rename term initEnv) initReader initState
      return $ Prog imports (Atoms atms) term'

-- The rest of the declarations here are not exported

{--

The renaming occurs in RWS monad that is instantiated as follows:

* The reader is the library environment
* The state is the unique variable counter
* The output is not used so we instantiate it to a dummy unit type

Note that the environment used for tracking α-substitutions is being
threaded explicitly. That is encoded in the `Env` map.

--}


type S = RWST LibEnv () Integer (Except String)

-- | Environment for unqualified imports: maps function names to their library
type UnqualifiedLibEnv = Map.Map VarName LibName
-- | Map from effective library name (alias or original) to:
--   (original library name for codegen, set of available exports)
-- Used for resolving and validating A.foo() syntax
type LibExports = Map.Map LibName (LibName, Set.Set VarName)
-- | Combined environment for the Reader monad
type LibEnv = (UnqualifiedLibEnv, LibExports)

type Env    = Map.Map VarName VarName


mapFromImports :: Imports -> LibEnv
mapFromImports (Imports imports) =
  let
    -- Get effective exports: use selected if specified, otherwise all exports
    effectiveExports imp = case importSelected imp of
      Just selected -> selected
      Nothing -> case importExports imp of
        Just exports -> exports
        Nothing -> []

    -- Get effective name for qualified access: alias if present, otherwise original
    effectiveName imp = case importAlias imp of
      Just alias -> alias
      Nothing -> importLib imp

    -- Build unqualified environment (only unqualified imports)
    -- Maps each exported function name to the original library
    unqualifiedImports = [imp | imp <- imports, importMode imp == Unqualified]
    unqualEnv = foldl insLib Map.empty unqualifiedImports
      where
        insLib m imp =
          let lib = importLib imp
              defs = effectiveExports imp
          in foldl (\m' def -> Map.insert def lib m') m defs

    -- Build map from effective name (alias or original) to (original lib, effective exports)
    -- This is used for resolving and validating A.foo() syntax
    libExports = Map.fromList
      [ (effectiveName imp, (importLib imp, Set.fromList (effectiveExports imp)))
      | imp <- imports
      ]
  in
    (unqualEnv, libExports)


-- | Sanitize variable names to be JavaScript-compatible identifiers
sanitizeForJS :: VarName -> VarName
sanitizeForJS = map sanitizeChar
  where
    sanitizeChar '\'' = '_'  -- Replace single quotes with underscores
    sanitizeChar c = c        -- Keep other characters as-is

unique :: VarName -> S VarName
unique v = do
  n <- State.get
  put (n + 1)
  return $ sanitizeForJS v ++ show n


lookforalpha :: VarName -> Env -> VarName
lookforalpha v m = Map.findWithDefault v v m


lookforgen :: VarName -> Env -> S VarAccess
lookforgen v m =
    case Map.lookup v m of
       Just v -> return $ RegVar v
       Nothing -> do
          (unqualEnv, _) <- ask
          case Map.lookup v unqualEnv of
            Just lib' -> return $ LibVar lib' v
            Nothing -> return  $ BaseName v


extend :: VarName -> VarName -> Env -> Env
extend v v' m = Map.insert v v' m

-- | Rename a Located Term, preserving the location
rename :: LTerm -> Env -> S LTerm
rename (Loc pos term) m = do
  term' <- renameTerm pos term m
  return $ Loc pos term'

-- | Rename the inner Term given its position (for qualified access resolution)
renameTerm :: PosInf -> Core.Term -> Env -> S Core.Term
renameTerm _ (Lit l) _ = return (Lit l)
renameTerm _ (Error t) m = do
      t' <- rename t m
      return $ Error t'
renameTerm pos (Var (RegVar v)) m = do
  v' <- lookforgen v m
  return $ Var v'

renameTerm _ (Var x) _  = return $ Var x
renameTerm _ (Abs l) m = do
  l' <- renameLambda l m
  return $ Abs l'
renameTerm _ (App t1 t2) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  return $ App t1' t2'
renameTerm _ (Let decl t) m = do
  (m', decl') <- renameDecl decl m
  t' <- rename t m'
  return $ Let decl' t'

renameTerm _ (If t1 t2 t3) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  t3' <- rename t3 m
  return $ If t1' t2' t3'

renameTerm _ (AssertElseError t1 t2 t3) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  t3' <- rename t3 m
  return $ AssertElseError t1' t2' t3'


renameTerm _ (Tuple terms) m = do
  terms' <- mapM (flip rename m) terms
  return $ Tuple terms'

renameTerm _ (Record fields) m = do
  fields' <- mapM renameField fields
  return $ Record fields'
     where renameField (f, t) = do
                   t' <- rename t m
                   return (f, t')

renameTerm _ (WithRecord e fields) m = do
  t' <- rename e m
  fs <- mapM renameField fields
  return $ WithRecord t' fs
  where renameField (f, t) = do
                   t' <- rename t m
                   return (f, t')

renameTerm pos (ProjField lt f) m = do
  maybeQualified <- tryQualifiedAccess
  case maybeQualified of
    Just term -> return term
    Nothing   -> do
      lt' <- rename lt m
      return $ ProjField lt' f
  where
    tryQualifiedAccess = case lt of
      -- Check if this is a qualified module access (e.g., A.foo or Alias.foo)
      -- At this stage, vars are RegVar from lowering, so we check RegVar
      Loc _ (Var (RegVar v)) | not (Map.member v m) -> do
        (_, libExports) <- ask
        case Map.lookup (LibName v) libExports of
          Just (originalLib, exports) ->
            if Set.member f exports
            then return $ Just (Var (LibVar originalLib f))  -- Use original lib for codegen
            else lift $ throwError $
              "Library '" ++ v ++ "' does not export '" ++ f ++ "'"
          Nothing -> return Nothing  -- Not a library access
      _ -> return Nothing
renameTerm _ (ProjIdx t idx) m = do
  t' <- rename t m
  return $ ProjIdx t' idx
renameTerm _ (List terms) m = do
  terms' <- mapM (flip rename m) terms
  return $ List terms'
renameTerm _ (ListCons t1 t2) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  return $ ListCons t1' t2'
renameTerm _ (Bin op t1 t2) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  return $ Bin op t1' t2'
renameTerm _ (Un op e) m = do
  e' <- rename e m
  return $ Un op e'

renameLambda :: Core.Lambda -> Env -> S Core.Lambda
renameLambda (Unary v vpos t) m = do
  v' <- unique v
  t' <- rename t $ extend v v' m
  return $ Unary v' vpos t'
renameLambda (Nullary t) m = do
  t' <- rename t m
  return $ Nullary t'


renameDecl :: Decl -> (Map.Map VarName VarName) -> S (Map.Map VarName VarName, Decl)
renameDecl (ValDecl v t) m = do
  v' <- unique v
  let m' = extend v v' m
  t' <- rename t m
  let decl' = (ValDecl v' t')
  return (m', decl')

renameDecl (FunDecs decs) m = do
  m' <- foldM ext_funDecl m decs
  decs' <- mapM (\(FunDecl v l pos) -> liftM (\l' -> FunDecl (lookforalpha v m') l' pos) (renameLambda l m')) decs
  let decl' = (FunDecs decs')
  return (m', decl')
  where ext_funDecl m' (FunDecl v _ _) = do
          v' <- unique v
          return $ extend v v' m'



--------------------------------------------------
-- 3. Pretty printing
--------------------------------------------------


-- show is defined via pretty printing
instance Show Term
  where show t = PP.render (ppTermInner 0 t)

instance ShowIndent Prog where
  showIndent k t = PP.render (nest k (ppProg t))
--------------------------------------------------




ppProg :: Prog -> PP.Doc
ppProg (Prog (Imports imports) (Atoms atoms) term) =
  let ppAtoms =
        if null atoms
          then PP.empty
          else (text "datatype Atoms = ") <+>
               (hsep $ PP.punctuate (text " |") (map text atoms))

      ppImports = if null imports then PP.empty else text "<<imports>>\n"
  in ppImports $$ ppAtoms $$ ppLTerm 0 term

-- | Pretty print a Located Term
ppLTerm :: Precedence -> LTerm -> PP.Doc
ppLTerm parentPrec (Loc _ t) = ppTermInner parentPrec t

-- | Pretty print a Term (inner, without location)
ppTermInner :: Precedence -> Term -> PP.Doc
ppTermInner parentPrec t =
   let thisTermPrec = termPrec t
   in PP.maybeParens (thisTermPrec < parentPrec )
      $ ppTerm' t

   -- uncomment to pretty print explicitly; 2017-10-14: AA
   -- in PP.maybeParens (thisTermPrec < 10000)  $ ppTerm' t

ppTerm' :: Term -> PP.Doc
ppTerm' (Lit literal) = ppLit literal

ppTerm' (Error lt) = text "error " PP.<> ppLTerm 0 lt

ppTerm'  (Tuple lts) =
  PP.parens $
  PP.hcat $
  PP.punctuate (text ",") (map (ppLTerm 0) lts)

ppTerm'  (List lts) =
  PP.brackets $
  PP.hcat $
  PP.punctuate (text ",") (map (ppLTerm 0) lts)

ppTerm' (Record fs) = PP.braces $ qqLFields fs

ppTerm' (WithRecord le fs) =
    PP.braces $ PP.hsep [ ppLTerm 0 le, text "with", qqLFields fs]

ppTerm' (ProjField lt fn) =
  ppLTerm projPrec lt PP.<> text "." PP.<> PP.text fn

ppTerm' (ProjIdx lt idx) =
  ppLTerm projPrec lt PP.<> text "." PP.<> PP.text (show idx)


ppTerm' (ListCons lhd ltl) =
   ppLTerm consPrec lhd PP.<> text "::" PP.<> ppLTerm consPrec ltl

ppTerm' (Var (RegVar x)) = text x
ppTerm' (Var (LibVar (LibName lib) var)) = text lib <+> text "." <+> text var
ppTerm' (Var (BaseName v)) = text v
ppTerm' (Abs lam) =
  let (ppArgs, ppBody) = qqLambda lam
  in text "fn" <+> ppArgs <+> text "=>" <+> ppBody

ppTerm' (App lt1 lt2) =
    ppLTerm appPrec lt1
          <+> (ppLTerm argPrec lt2)

ppTerm' (Let dec lbody) =
  text "let" <+>
  nest 3 (ppDecl dec) $$
  text "in" <+>
  nest 3 (ppLTerm 0 lbody) $$
  text "end"


ppTerm' (If le0 le1 le2) =
  text "if" <+>
  ppLTerm 0 le0 $$
  text "then" <+>
  ppLTerm 0 le1 $$
  text "else" <+>
  ppLTerm 0 le2

ppTerm' (AssertElseError le0 le1 le2) =
  text "assert" <+>
  ppLTerm 0 le0 $$
  text "then" <+>
  ppLTerm 0 le1 $$
  text "elseError" <+>
  ppLTerm 0 le2



ppTerm' (Bin op lt1 lt2) =
  let binOpPrec = opPrec op
  in
     ppLTerm binOpPrec lt1 <+>
     text (show op) <+>
     ppLTerm binOpPrec lt2

ppTerm' (Un op lt) =
  let unOpPrec = op1Prec op
  in
     text (show op) <+>
     ppLTerm unOpPrec lt


-- | Pretty print LFields (fields with Located terms)
qqLFields :: LFields -> PP.Doc
qqLFields fs = PP.hcat $
    PP.punctuate (text ",") (map ppField fs)
     where ppField (name, lt)  =
              PP.hcat [PP.text name, PP.text "=", ppLTerm 0 lt ]

qqLambda :: Lambda -> (PP.Doc, PP.Doc)
qqLambda (Unary arg _ lbody) =
  ( text arg, ppLTerm 0 lbody )
qqLambda (Nullary lbody) =
  ( text "()", ppLTerm 0 lbody)

ppDecl :: Decl -> PP.Doc
ppDecl (ValDecl arg lt) =
  text "val" <+> text arg <+> text "="
    <+> ppLTerm 0 lt
ppDecl (FunDecs fs) = ppFuns fs
  where
    ppFunDecl prefix (FunDecl fname lam _) =
      ppFunOptions (prefix ++ " " ++ fname) lam

    ppFunOptions prefix lam =
        let (ppArgs, ppBody) = qqLambda lam in
        text prefix <+> ppArgs <+> text "=" <+> nest 2 ppBody


    ppFuns (doc:docs) =
      let ppFirstFun = ppFunDecl "fun"
          ppOtherFun = ppFunDecl "and"
      in ppFirstFun doc $$ vcat (map ppOtherFun docs)


    ppFuns _ = PP.empty


ppLit :: Lit -> PP.Doc
ppLit (LNumeric (NumInt i) _)  = PP.integer i
ppLit (LNumeric (NumFloat f) _) = PP.double f
ppLit (LString s)   = PP.doubleQuotes (text s)
ppLit (LLabel s)    = PP.braces (text s)
ppLit LUnit         = text "()"
ppLit (LBool True)  = text "true"
ppLit (LBool False) = text "false"
ppLit (LAtom a) = text a
ppLit (LDCLabel dc) = ppDCLabelExpLit dc


termPrec :: Term -> Precedence
termPrec (Lit _)           = maxPrec
termPrec (Tuple _)         = maxPrec
termPrec (List _)          = maxPrec
termPrec (Var _)           = maxPrec
termPrec (App _ _)         = appPrec
termPrec (Bin op _ _)      = opPrec op
termPrec (ListCons _ _)    = 200
termPrec _                 = 0
