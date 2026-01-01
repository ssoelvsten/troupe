module DirectWOPats ( Lambda (..)
              , Term (..)
              , Decl (..)
              , FunDecl (..)
              , Numeric(..)
              , Lit(..)
              , AtomName
              , Atoms(..)
              , Prog(..)
              )
where

import Basics
import qualified Text.PrettyPrint.HughesPJ as PP
import Text.PrettyPrint.HughesPJ (
    (<+>), ($$), text, hsep, vcat, nest)
import ShowIndent
import DCLabels
import TroupePositionInfo

data Decl
    = ValDecl VarName Term
    | FunDecs [FunDecl]
  deriving (Eq)

data FunDecl = FunDecl VarName Lambda PosInf
  deriving (Eq)

-- Numeric type represents integer and floating point numeric literals
data Numeric = NumInt Integer | NumFloat Double
  deriving (Eq, Ord, Show)

data Lit
    = LNumeric Numeric PosInf
    | LString String
    | LLabel String
    | LDCLabel DCLabelExp
    | LUnit
    | LBool Bool
    | LAtom AtomName
  deriving (Eq, Show)



data Lambda = Lambda [VarName] Term
  deriving (Eq)

type Fields = [(FieldName, Term)]

data Term
    = Lit Lit
    | Var VarName PosInf
    | Abs Lambda PosInf
    | App Term [Term] PosInf
    | Let [Decl] Term PosInf
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
      deriving (Eq, Show)

data Prog = Prog Imports Atoms Term
  deriving (Eq, Show)

instance GetPosInfo Term where
  posInfo (Lit _) = NoPos
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






--------------------------------------------------
-- show is defined via pretty printing
instance Show Term
  where show t = PP.render (ppTerm 0 t)

instance ShowIndent Prog where
  showIndent k t = PP.render (nest k (ppProg t))
--------------------------------------------------
-- obs: these functions are not exported
--




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

ppTerm' (Record fs _) =
    PP.braces $  qqFields fs

ppTerm' (WithRecord e fs _) =
    PP.braces $ PP.hsep [ ppTerm 0 e, text "with", qqFields fs ]

ppTerm' (ProjField t fn _) =
  ppTerm projPrec t PP.<> text "." PP.<> PP.text fn

ppTerm' (ProjIdx t idx _) =
  ppTerm projPrec t PP.<> text "." PP.<> PP.text (show idx)


ppTerm'  (List ts _) =
  PP.brackets $
  PP.hcat $
  PP.punctuate (text ",") (map (ppTerm 0) ts)



ppTerm' (ListCons hd tl _) =
   ppTerm consPrec hd PP.<> text "::" PP.<> ppTerm consPrec tl

ppTerm' (Var x _) = text x
ppTerm' (Abs lam _) =
  let (ppArgs, ppBody) = qqLambda lam
  in text "fn" <+> ppArgs <+> text "=>" <+> ppBody

ppTerm' (App t1 t2s _) =
    ppTerm appPrec t1
          <+> (hsep (map (ppTerm argPrec) t2s))

ppTerm' (Let decs body _) =
  text "let" <+>
  nest 3 (vcat (map ppDecl decs)) $$
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
qqLambda (Lambda args body) =
  let ppArgs' =
        if null args then text "()"
                     else hsep $ map text args
  in ( ppArgs', ppTerm 0 body)

ppDecl (ValDecl x t) = text "val" <+> text x <+> text "=" <+> ppTerm 0 t
ppDecl (FunDecs fs) = ppFuns (map ppFunDecl fs)
  where
    ppFunDecl ( FunDecl fname (Lambda args body) _) =
      let ppArgs = if args == [] then text "()" else hsep ( map text args)
      in (text fname <+> ppArgs <+> text "=" , ppTerm 0 body)
    ppFuns (doc:docs) =
      let pp' prefix (docHead,docBody) = text prefix  <+> docHead  $$ nest 2 docBody
          ppFirstFun = pp' "fun"
          ppOtherFun = pp' "and"
      in ppFirstFun doc $$ vcat (map ppOtherFun docs)
    ppFuns _ = PP.empty

ppLit :: Lit -> PP.Doc
ppLit (LNumeric (NumInt i) _)  = PP.integer i
ppLit (LNumeric (NumFloat f) _) = PP.double f
ppLit (LString s)   = PP.doubleQuotes (text s)
ppLit (LLabel s)    = PP.braces (text s)
ppLit (LDCLabel dc) = ppDCLabelExpLit dc
ppLit LUnit         = text "()"
ppLit (LBool True)  = text "true"
ppLit (LBool False) = text "false"
ppLit (LAtom a) = text a




termPrec :: Term -> Precedence
termPrec (Lit _)           = maxPrec
termPrec (Tuple _ _)       = maxPrec
termPrec (List _ _)        = maxPrec
termPrec (Var _ _)         = maxPrec
termPrec (App _ _ _)       = appPrec
termPrec (Bin op _ _ _)    = opPrec op
termPrec (ListCons _ _ _)  = 200
termPrec _                 = 0
