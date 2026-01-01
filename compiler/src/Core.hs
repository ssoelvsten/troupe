{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DefaultSignatures #-}


module Core (   Lambda (..)
              , Term (..)
              , Decl (..)
              , FunDecl (..)
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

import           TroupePositionInfo
import           DCLabels (DCLabelExp, ppDCLabelExpLit, dcLabelEq, v1LabelEq, v1LabelToDCLabelExp)

--------------------------------------------------
-- AST is the same as Direct, but lambda are unary (or nullary)

data Lambda = Unary VarName Term
            | Nullary Term
  deriving (Eq)

data Decl
    = ValDecl VarName Term
    | FunDecs [FunDecl]
  deriving (Eq )

data FunDecl = FunDecl VarName Lambda
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

type Fields = [(FieldName, Term)]

data VarAccess
    -- | A normal variable
    = RegVar VarName
    -- | Referring to a definition from a library
    | LibVar LibName VarName
    -- | A predefined name (e.g. send, receive)
    | BaseName VarName
 deriving (Eq)
data Term
    = Lit Lit
    | Var VarAccess PosInf
    | Abs Lambda PosInf
    | App Term Term PosInf
    | Let Decl Term PosInf
    | If Term Term Term PosInf
    | AssertElseError Term Term Term PosInf
    | Tuple [Term] PosInf
    | Record Fields PosInf
    | WithRecord Term Fields PosInf
    | ProjField Term FieldName PosInf
    | ProjIdx Term Word PosInf
    | List [Term] PosInf
    | ListCons Term Term PosInf
    | Bin BinOp Term Term PosInf
    | Un UnaryOp Term PosInf
    | Error Term PosInf
  deriving (Eq)


data Atoms = Atoms [AtomName]
  deriving (Eq, Show, Generic)
instance Serialize Atoms


data Prog = Prog Imports Atoms Term
  deriving (Eq, Show)

instance GetPosInfo Term where
  posInfo (Lit l) = posInfo l
  posInfo (Var _ p) = p
  posInfo (Abs _ p) = p
  posInfo (App _ _ p) = p
  posInfo (Let _ _ p) = p
  posInfo (If _ _ _ p) = p
  posInfo (AssertElseError _ _ _ p) = p
  posInfo (Tuple _ p) = p
  posInfo (Record _ p) = p
  posInfo (WithRecord _ _ p) = p
  posInfo (ProjField _ _ p) = p
  posInfo (ProjIdx _ _ p) = p
  posInfo (List _ p) = p
  posInfo (ListCons _ _ p) = p
  posInfo (Bin _ _ _ p) = p
  posInfo (Un _ _ p) = p
  posInfo (Error _ p) = p


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

lowerProg (D.Prog imports atms term) = Prog imports (trans atms) (lower term)



-- the rest of the declarations in this part are not exported

trans :: D.Atoms -> Atoms
trans (D.Atoms atms) = Atoms atms

lowerLam (D.Lambda vs t) =
  case vs of
    [] -> Unary "$unit" (lower t)
    x:xs -> Unary x (foldr (\x b -> (Abs (Unary x b) (posInfo t))) (lower t) xs)


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

lower :: D.Term -> Core.Term
lower (D.Lit l) = Lit (lowerLit l)
lower (D.Error t p) = Error (lower t) p
lower (D.Var v pi) = Var (RegVar v) pi
  -- 2018-07-01: AA: note that we are mapping all vars to RegVar at
  -- this stage. This is a bit of a hack. A cleaner apporach is to
  -- have a separate intermediate representation. For now we save on
  -- the engineering effort and proceed like this, because at the
  -- subsequent phase (renaming) we resolve which names are base
  -- names, which are lib names, and which are actually just regular
  -- variables.

lower (D.Abs lam pi) = Abs (lowerLam lam) pi

lower (D.App e [] pi) = Core.App (lower e) (Lit LUnit) pi -- does this form even exist?
lower (D.App e es pi) = foldl (\acc t -> Core.App acc t pi) (lower e) (map lower es)
lower (D.Let decls e pi) =
  foldr (\ decl t -> Let (lowerDecl decl) t pi) (lower e) decls
  where lowerDecl (D.ValDecl vname e) = ValDecl vname (lower e)
        lowerDecl (D.FunDecs decs) = FunDecs (map lowerFun decs)
        lowerFun  (D.FunDecl v lam) = FunDecl v (lowerLam lam)
-- lower (D.Case t patTermLst) = Case (lower t) (map (\(p,t) -> (lowerDeclPat p, lower t)) patTermLst)
lower (D.If e1 e2 e3 pi) = If (lower e1) (lower e2) (lower e3) pi
lower (D.AssertElseError e1 e2 e3 p) = AssertElseError (lower e1) (lower e2) (lower e3) p
lower (D.Tuple terms pi) = Tuple (map lower terms) pi
lower (D.Record fields pi) = Record (map (\(f, t) -> (f, lower t)) fields) pi
lower (D.WithRecord e fields pi) = WithRecord (lower e) (map (\(f, t) -> (f, lower t)) fields) pi
lower (D.ProjField t f pi) = ProjField (lower t) f pi
lower (D.ProjIdx t idx pi) = ProjIdx (lower t) idx pi
lower (D.List terms pi) = List (map lower terms) pi
lower (D.ListCons t1 t2 pi) = ListCons (lower t1) (lower t2) pi

-- special casing shortcutting semantics; 2018-03-06;
lower (D.Bin And e1 e2 pi) = lower (D.If e1 e2 (D.Lit (D.LBool False)) pi)
lower (D.Bin Or e1 e2 pi) = lower (D.If e1 (D.Lit (D.LBool True)) e2 pi)
lower (D.Bin op e1 e2 pi) = Bin op (lower e1) (lower e2) pi
lower (D.Un op e pi) = Un op (lower e) pi


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

rename :: Core.Term -> Env -> S Core.Term
rename (Lit l) m = return (Lit l)
rename (Error t p) m = do
      t' <- rename t m
      return $ Error t' p
rename (Var (RegVar v) pi) m = do
  v <- lookforgen v m
  return $ Var v pi


rename (Var x pi) m  = return $ Var x pi
rename (Abs l pi) m = do
  l' <- renameLambda l m
  return $ Abs l' pi
rename (App t1 t2 pi) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  return $ App t1' t2' pi
rename (Let decl t pi) m = do
  (m', decl') <- renameDecl decl m
  t' <- rename t m'
  return $ Let decl' t' pi

rename (If t1 t2 t3 pi) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  t3' <- rename t3 m
  return $ If t1' t2' t3' pi

rename (AssertElseError t1 t2 t3 p) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  t3' <- rename t3 m
  return $ AssertElseError t1' t2' t3' p


rename (Tuple terms pi) m = do
  terms' <- mapM (flip rename m) terms
  return $ Tuple terms' pi

rename (Record fields pi) m = do
  fields' <- mapM renameField fields
  return $ Record fields' pi
     where renameField (f, t) = do
                   t' <- rename t m
                   return (f, t')

rename (WithRecord e fields pi) m = do
  t' <- rename e m
  fs <- mapM renameField fields
  return $ WithRecord t' fs pi
  where renameField (f, t) = do
                   t' <- rename t m
                   return (f, t')

rename (ProjField t f pi) m = do
  maybeQualified <- tryQualifiedAccess
  case maybeQualified of
    Just term -> return term
    Nothing   -> do
      t' <- rename t m
      return $ ProjField t' f pi
  where
    tryQualifiedAccess = case t of
      -- Check if this is a qualified module access (e.g., A.foo or Alias.foo)
      -- At this stage, vars are RegVar from lowering, so we check RegVar
      Var (RegVar v) _ | not (Map.member v m) -> do
        (_, libExports) <- ask
        case Map.lookup (LibName v) libExports of
          Just (originalLib, exports) ->
            if Set.member f exports
            then return $ Just (Var (LibVar originalLib f) pi)  -- Use original lib for codegen
            else lift $ throwError $
              "Library '" ++ v ++ "' does not export '" ++ f ++ "'"
          Nothing -> return Nothing  -- Not a library access
      _ -> return Nothing
rename (ProjIdx t idx pi) m = do
  t' <- rename t m
  return $ ProjIdx t' idx pi
rename (List terms pi) m = do
  terms' <- mapM (flip rename m) terms
  return $ List terms' pi
rename (ListCons t1 t2 pi) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  return $ ListCons t1' t2' pi
rename (Bin op t1 t2 pi) m = do
  t1' <- rename t1 m
  t2' <- rename t2 m
  return $ Bin op t1' t2' pi
rename (Un op e pi) m = do
  e' <- rename e m
  return $ Un op e' pi

renameLambda :: Core.Lambda -> Env -> S Core.Lambda
renameLambda (Unary v t) m = do
  v' <- unique v
  t' <- rename t $ extend v v' m
  return $ Unary v' t'
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
  decs' <- mapM (\(FunDecl v l) -> liftM (FunDecl (lookforalpha v m')) (renameLambda l m')) decs
  let decl' = (FunDecs decs')
  return (m', decl')
  where ext_funDecl m (FunDecl v _) = do
          v' <- unique v
          return $ extend v v' m



--------------------------------------------------
-- 3. Pretty printing
--------------------------------------------------


-- show is defined via pretty printing
instance Show Term
  where show t = PP.render (ppTerm 0 t)

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
  in ppImports $$ ppAtoms $$ ppTerm 0 term


ppTerm :: Precedence -> Term -> PP.Doc
ppTerm parentPrec t =
   let thisTermPrec = termPrec t
   in PP.maybeParens (thisTermPrec < parentPrec )
      $ ppTerm' t

   -- uncomment to pretty print explicitly; 2017-10-14: AA
   -- in PP.maybeParens (thisTermPrec < 10000)  $ ppTerm' t

ppTerm' :: Term -> PP.Doc
ppTerm' (Lit literal) = ppLit literal

ppTerm' (Error t _) = text "error " PP.<> ppTerm' t

ppTerm'  (Tuple ts _) =
  PP.parens $
  PP.hcat $
  PP.punctuate (text ",") (map (ppTerm 0) ts)

ppTerm'  (List ts _) =
  PP.brackets $
  PP.hcat $
  PP.punctuate (text ",") (map (ppTerm 0) ts)

ppTerm' (Record fs _) = PP.braces $ qqFields fs

ppTerm' (WithRecord e fs _) =
    PP.braces $ PP.hsep [ ppTerm 0 e, text "with", qqFields fs]

ppTerm' (ProjField t fn _) =
  ppTerm projPrec t PP.<> text "." PP.<> PP.text fn

ppTerm' (ProjIdx t idx _) =
  ppTerm projPrec t PP.<> text "." PP.<> PP.text (show idx)


ppTerm' (ListCons hd tl _) =
   ppTerm consPrec hd PP.<> text "::" PP.<> ppTerm consPrec tl

ppTerm' (Var (RegVar x) _) = text x
ppTerm' (Var (LibVar (LibName lib) var) _) = text lib <+> text "." <+> text var
ppTerm' (Var (BaseName v) _) = text v
ppTerm' (Abs lam _) =
  let (ppArgs, ppBody) = qqLambda lam
  in text "fn" <+> ppArgs <+> text "=>" <+> ppBody

ppTerm' (App t1 t2s _) =
    ppTerm appPrec t1
          <+> (ppTerm argPrec t2s)

ppTerm' (Let dec body _) =
  text "let" <+>
  nest 3 (ppDecl dec) $$
  text "in" <+>
  nest 3 (ppTerm 0 body) $$
  text "end"


ppTerm' (If e0 e1 e2 _) =
  text "if" <+>
  ppTerm 0 e0 $$
  text "then" <+>
  ppTerm 0 e1 $$
  text "else" <+>
  ppTerm 0 e2

ppTerm' (AssertElseError e0 e1 e2 _) =
  text "assert" <+>
  ppTerm 0 e0 $$
  text "then" <+>
  ppTerm 0 e1 $$
  text "elseError" <+>
  ppTerm 0 e2



ppTerm' (Bin op t1 t2 _) =
  let binOpPrec = opPrec op
  in
     ppTerm binOpPrec t1 <+>
     text (show op) <+>
     ppTerm binOpPrec t2

ppTerm' (Un op t _) =
  let unOpPrec = op1Prec op
  in
     text (show op) <+>
     ppTerm unOpPrec t


qqFields fs = PP.hcat $
    PP.punctuate (text ",") (map ppField fs)
     where ppField (name, t)  = 
              PP.hcat [PP.text name, PP.text "=", ppTerm 0 t ]

qqLambda :: Lambda -> (PP.Doc, PP.Doc)
qqLambda (Unary arg body) =
  ( text arg, ppTerm 0 body )
qqLambda (Nullary body) =
  ( text "()", ppTerm 0 body)

ppDecl :: Decl -> PP.Doc
ppDecl (ValDecl arg t) =
  text "val" <+> text arg <+> text "="
    <+> ppTerm 0 t
ppDecl (FunDecs fs) = ppFuns fs
  where
    ppFunDecl prefix (FunDecl fname lam) =
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
termPrec (Tuple _ _)       = maxPrec
termPrec (List _ _)        = maxPrec
termPrec (Var _ _)         = maxPrec
termPrec (App _ _ _)       = appPrec
termPrec (Bin op _ _ _)    = opPrec op
termPrec (ListCons _ _ _)  = 200
termPrec _                 = 0
