module DirectWOPats ( Lambda (..)
              , Term (..)
              , LTerm
              , Decl (..)
              , FunDecl (..)
              , Numeric(..)
              , Lit(..)
              , LFields
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
import TroupePositionInfo (Located(..), getLoc, unLoc, noLoc, PosInf(..), GetPosInfo(..))

-- | Located type aliases - all terms are wrapped in Located
type LTerm = Located Term
type LFields = [(FieldName, LTerm)]

data Decl
    = ValDecl VarName LTerm
    | FunDecs [FunDecl]
  deriving (Eq)

-- | Function declaration with name, lambda, and definition position
data FunDecl = FunDecl VarName Lambda PosInf
  deriving (Eq)

-- Numeric type represents integer and floating point numeric literals
data Numeric = NumInt Integer | NumFloat Double
  deriving (Eq, Ord, Show)

-- | Literals - note: position is NOT embedded in literals anymore,
-- it comes from the Located wrapper
data Lit
    = LNumeric Numeric
    | LString String
    | LLabel String
    | LDCLabel DCLabelExp
    | LUnit
    | LBool Bool
    | LAtom AtomName
  deriving (Eq, Show)

-- | Lambda - uses Located wrapper for body, keeps arg positions inline
data Lambda = Lambda [(VarName, PosInf)] LTerm
  deriving (Eq)

-- | Term - no embedded positions, all position info is in Located wrapper
data Term
    = Lit Lit
    | Var VarName
    | Abs Lambda
    | App LTerm [LTerm]
    | Let [Decl] LTerm
    | If LTerm LTerm LTerm
    | AssertElseError LTerm LTerm LTerm    -- position from Located wrapper
    | Tuple [LTerm]
    | Record LFields
    | WithRecord LTerm LFields
    | ProjField LTerm FieldName
    | ProjIdx LTerm Word
    | List [LTerm]
    | ListCons LTerm LTerm
    | Bin BinOp LTerm LTerm
    | Un UnaryOp LTerm
    | Error LTerm                           -- position from Located wrapper
    deriving (Eq)

data Atoms = Atoms [AtomName]
      deriving (Eq, Show)

data Prog = Prog Imports Atoms LTerm
  deriving (Eq, Show)

-- Note: GetPosInfo for LTerm is provided by TroupePositionInfo's
-- instance GetPosInfo (Located a) which extracts position from Loc wrapper





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
ppProg (Prog (Imports imports) (Atoms atoms) lterm) =
  let ppAtoms =
        if null atoms
          then PP.empty
          else (text "datatype Atoms = ") <+>
               (hsep $ PP.punctuate (text " |") (map text atoms))
      ppImports = if null imports then PP.empty else text "<<imports>>\n"
  in ppImports $$ ppAtoms $$ ppLTerm 0 lterm

-- | Pretty print a Located Term
ppLTerm :: Precedence -> LTerm -> PP.Doc
ppLTerm parentPrec (Loc _ t) = ppTerm parentPrec t

ppTerm :: Precedence -> Term -> PP.Doc
ppTerm parentPrec t =
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

ppTerm' (Record fs) =
    PP.braces $ qqLFields fs

ppTerm' (WithRecord le fs) =
    PP.braces $ PP.hsep [ ppLTerm 0 le, text "with", qqLFields fs ]

ppTerm' (ProjField lt fn) =
  ppLTerm projPrec lt PP.<> text "." PP.<> PP.text fn

ppTerm' (ProjIdx lt idx) =
  ppLTerm projPrec lt PP.<> text "." PP.<> PP.text (show idx)


ppTerm'  (List lts) =
  PP.brackets $
  PP.hcat $
  PP.punctuate (text ",") (map (ppLTerm 0) lts)



ppTerm' (ListCons lhd ltl) =
   ppLTerm consPrec lhd PP.<> text "::" PP.<> ppLTerm consPrec ltl

ppTerm' (Var x) = text x
ppTerm' (Abs lam) =
  let (ppArgs, ppBody) = qqLambda lam
  in text "fn" <+> ppArgs <+> text "=>" <+> ppBody

ppTerm' (App lt1 lt2s) =
    ppLTerm appPrec lt1
          <+> (hsep (map (ppLTerm argPrec) lt2s))

ppTerm' (Let decs lbody) =
  text "let" <+>
  nest 3 (vcat (map ppDecl decs)) $$
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


-- | Pretty print LFields
qqLFields :: LFields -> PP.Doc
qqLFields fs = PP.hcat $
    PP.punctuate (text ",") (map ppField fs)
     where ppField (name, lt)  =
              PP.hcat [PP.text name, PP.text "=", ppLTerm 0 lt ]


qqLambda :: Lambda -> (PP.Doc, PP.Doc)
qqLambda (Lambda args lbody) =
  let ppArgs' =
        if null args then text "()"
                     else hsep $ map (text . fst) args
  in ( ppArgs', ppLTerm 0 lbody)

ppDecl (ValDecl x lt) = text "val" <+> text x <+> text "=" <+> ppLTerm 0 lt
ppDecl (FunDecs fs) = ppFuns (map ppFunDecl fs)
  where
    ppFunDecl ( FunDecl fname (Lambda args lbody) _) =
      let ppArgs = if args == [] then text "()" else hsep ( map (text . fst) args)
      in (text fname <+> ppArgs <+> text "=" , ppLTerm 0 lbody)
    ppFuns (doc:docs) =
      let pp' prefix (docHead,docBody) = text prefix  <+> docHead  $$ nest 2 docBody
          ppFirstFun = pp' "fun"
          ppOtherFun = pp' "and"
      in ppFirstFun doc $$ vcat (map ppOtherFun docs)
    ppFuns _ = PP.empty

ppLit :: Lit -> PP.Doc
ppLit (LNumeric (NumInt i))  = PP.integer i
ppLit (LNumeric (NumFloat f)) = PP.double f
ppLit (LString s)   = PP.doubleQuotes (text s)
ppLit (LLabel s)    = PP.braces (text s)
ppLit (LDCLabel dc) = ppDCLabelExpLit dc
ppLit LUnit         = text "()"
ppLit (LBool True)  = text "true"
ppLit (LBool False) = text "false"
ppLit (LAtom a) = text a




termPrec :: Term -> Precedence
termPrec (Lit _)           = maxPrec
termPrec (Tuple _)         = maxPrec
termPrec (List _)          = maxPrec
termPrec (Var _)           = maxPrec
termPrec (App _ _)         = appPrec
termPrec (Bin op _ _)      = opPrec op
termPrec (ListCons _ _)    = 200
termPrec _                 = 0
