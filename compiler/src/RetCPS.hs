{-# LANGUAGE DeriveFoldable #-}
{-# LANGUAGE DeriveTraversable #-}
{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DefaultSignatures #-}

module RetCPS
where

import GHC.Generics
import qualified Data.Serialize as Serialize

import Basics(BinOp(..),UnaryOp(..),Precedence, opPrec)
import qualified Basics
import qualified Core as C
import Core (ppLit)
import qualified Text.PrettyPrint.HughesPJ as PP
import Text.PrettyPrint.HughesPJ (
    (<+>), ($$), text, hsep, vcat, nest)
import           ShowIndent

import TroupePositionInfo

newtype VarName = VN Basics.VarName
    deriving (Eq, Ord, Generic)


instance Serialize.Serialize VarName
instance Show VarName where
  show (VN x) = show x

-- newtype KontName = K Basics.VarName deriving (Eq,Ord)
-- instance Show KontName where
--  show (K k) = "K" ++ k


{--

The language here is only the "surface-level" CPS, i.e., it does not contain any
runtime-specific terms; this also means that if we were to code gen we would be
doing that from this language

 -}

data KLambda = Unary VarName PosInf KTerm
             | Nullary KTerm
  deriving (Eq, Show, Ord)

data SVal
   = KAbs KLambda
   | Lit C.Lit
     deriving (Eq, Show, Ord)

data ContDef = Cont VarName KTerm
               deriving (Eq, Ord)
data FunDef = Fun VarName KLambda PosInf
              deriving (Eq, Ord)

type Fields = [(Basics.FieldName, VarName)]
data SimpleTerm
   = Bin BinOp VarName VarName PosInf
   | Un UnaryOp VarName PosInf
   | ValSimpleTerm SVal PosInf
   | Tuple [VarName] PosInf
   | Record Fields PosInf
   | WithRecord VarName Fields PosInf
   | ProjField VarName Basics.FieldName PosInf
   | ProjIdx VarName Word PosInf
   | List [VarName] PosInf
   | ListCons VarName VarName PosInf
   | Base Basics.VarName
   | Lib Basics.LibName Basics.VarName
     deriving (Eq, Show, Ord)

data KTerm
    = LetSimple VarName SimpleTerm KTerm PosInf
    | LetFun [FunDef] KTerm PosInf
    | LetRet ContDef KTerm PosInf
    | KontReturn VarName PosInf
    | ApplyFun VarName VarName PosInf
    | If VarName KTerm KTerm PosInf
    | AssertElseError VarName KTerm VarName PosInf
    | Error VarName PosInf
    | Halt VarName PosInf
    -- ; aa; 2018-07-02; bringing Halt back because
    -- of exports

      deriving (Eq, Ord)

data Prog = Prog C.Atoms KTerm
  deriving (Eq, Show)

instance GetPosInfo SimpleTerm where
  posInfo (Bin _ _ _ p) = p
  posInfo (Un _ _ p) = p
  posInfo (ValSimpleTerm _ p) = p
  posInfo (Tuple _ p) = p
  posInfo (Record _ p) = p
  posInfo (WithRecord _ _ p) = p
  posInfo (ProjField _ _ p) = p
  posInfo (ProjIdx _ _ p) = p
  posInfo (List _ p) = p
  posInfo (ListCons _ _ p) = p
  posInfo (Base _) = NoPos
  posInfo (Lib _ _) = NoPos

instance GetPosInfo KTerm where
  posInfo (LetSimple _ _ _ p) = p
  posInfo (LetFun _ _ p) = p
  posInfo (LetRet _ _ p) = p
  posInfo (KontReturn _ p) = p
  posInfo (ApplyFun _ _ p) = p
  posInfo (If _ _ _ p) = p
  posInfo (AssertElseError _ _ _ p) = p
  posInfo (Error _ p) = p
  posInfo (Halt _ p) = p

--------------------------------------------------
-- show is defined via pretty printing
instance Show KTerm
  where show t = PP.render (ppKTerm 0 t)

instance Show ContDef 
  where show (Cont x t) = PP.render ( ppKTerm 0 t)
instance ShowIndent Prog where
  showIndent k p = PP.render (nest k (ppProg p))
--------------------------------------------------
-- obs: these functions are not exported
--

ppProg :: Prog -> PP.Doc
ppProg (Prog (C.Atoms atoms) kterm) =
  let ppAtoms =
        if null atoms
          then PP.empty
          else (text "datatype Atoms = ") <+>
               (hsep $ PP.punctuate (text " |") (map text atoms))
  in ppAtoms $$ ppKTerm 0 kterm

ppKTerm :: Precedence -> KTerm -> PP.Doc

ppKTerm parentPrec t =
   let thisTermPrec = 1000
   in PP.maybeParens (thisTermPrec < parentPrec   )  $ ppKTerm' t

   -- uncomment to pretty print explicitly; 2017-10-14: AA
   -- in PP.maybeParens (thisTermPrec < 10000)  $ ppTerm'       Core.LAtom _ -> Nothingt

-- ppLit :: C.Lit -> PP.Doc
-- ppLit = C.ppLit 
-- ppLit  (C.LInt i pi) = PP.integer i 
-- ppLit  (C.LString s)   = PP.doubleQuotes (text s)
-- ppLit  (C.LLabel s)    = PP.braces (text s)
-- ppLit  (C.LUnit) = text "()"
-- ppLit  (C.LBool True) = text "true"
-- ppLit  (C.LBool False) = text "false"
-- ppLit  (C.LAtom a) = text a

textv (VN x) = text x

ppSimpleTerm :: SimpleTerm -> PP.Doc
ppSimpleTerm (Bin op (VN v1)  (VN v2) _) =
  text v1 <+> text (show op) <+> text v2
ppSimpleTerm (Un op (VN v) _) =
  text (show op) <+> text v
ppSimpleTerm (ValSimpleTerm (Lit lit) _) =
  ppLit lit
ppSimpleTerm (ValSimpleTerm (KAbs klam) _) =
  ppKLambda klam
ppSimpleTerm (Tuple vars _) =
  PP.parens $ PP.hsep $ PP.punctuate (text ",") (map textv vars)
ppSimpleTerm (List vars _) =
  PP.brackets $ PP.hsep $ PP.punctuate (text ",") (map textv vars)
ppSimpleTerm (ListCons v1 v2 _) =
  PP.parens $ textv v1 PP.<> text "::" PP.<> textv v2
ppSimpleTerm (Base b) = text b PP.<> text "$base"
ppSimpleTerm (Lib (Basics.LibName lib) v) = text lib <+> text "." <+> text v
ppSimpleTerm (Record fields _) = PP.braces $ qqFields fields
ppSimpleTerm (WithRecord x fields _) =
    PP.braces $ PP.hsep [textv x, text "with", qqFields fields]

ppSimpleTerm (ProjField x f _) =
  textv x PP.<> text "." PP.<> PP.text f
ppSimpleTerm (ProjIdx x idx _) =
  textv x PP.<> text "." PP.<> PP.text (show idx)

qqFields fields =
  PP.hcat $
  PP.punctuate (text ",") (map ppField fields)
    where ppField (name, v) = 
           PP.hcat [PP.text name, PP.text "=", textv v]


ppKLambda :: KLambda -> PP.Doc
ppKLambda (Unary pat _ kt) =
  text "fn" <+>  textv pat <+> text "=>" <+> ppKTerm 0 kt
ppKLambda (Nullary kt) =
  text "fn" <+> text "()" <+> text "=>" <+> ppKTerm 0 kt

ppKTerm' :: KTerm -> PP.Doc
ppKTerm'  (Error v _) = text "error" PP.<> textv v
-- ppKTerm'  (Abs lam) = ppLambda lam

--ppKTerm' (ApplyKont kname varname) =
--    text (show kname) <+> textv varname

ppKTerm' (Halt varname _) =
  text "halt" <+> textv varname

ppKTerm' (KontReturn varname _) =
  text "return" <+> textv varname

-- ppKTerm' (LetRet kname kterm) =
--   text "let-ret" <+> (text (show kname)) $$
--   text "in" <+>
--   nest 3 (ppKTerm 0 kterm) $$
--   text "end"

ppKTerm' (ApplyFun fname varname _) =
    textv fname <+> textv varname

ppKTerm' (LetSimple x t k _) =
  text "let-simple" <+>
  nest 3 (textv x <+> text "=" <+> ppSimpleTerm t) $$
  text "in" <+>
  nest 3 (ppKTerm 0 k) $$
  text "end"

ppKTerm' (LetRet (Cont pat kt1) kt2 _) =
  text "let-ret" <+>
  nest 3 (textv pat <+> text "=" <+> ppKTerm' kt1) $$
  text "in" <+>
  nest 3 (ppKTerm 0 kt2) $$
  text "end"

ppKTerm' (LetFun fdefs kt _) =
  text "let-fun" <+>
  nest 3 (ppFuns (map ppFunDecl fdefs)) $$
  text "in" <+>
  nest 3 (ppKTerm 0 kt) $$
  text "end"
  where
    ppFunDecl (Fun fname (Unary pat _ body) _) =
       (textv fname  <+> textv pat <+> text "=" , ppKTerm 0 body)
    ppFunDecl (Fun fname (Nullary body) _) =
       (textv fname  <+> text "()" <+> text "=" , ppKTerm 0 body)
    ppFuns (doc:docs) =
      let pp' prefix (docHead,docBody) = text prefix  <+> docHead  $$ nest 2 docBody
          ppFirstFun = pp' "fun"
          ppOtherFun = pp' "and"
      in ppFirstFun doc $$ vcat (map ppOtherFun docs)
    ppFuns _ = PP.empty

ppKTerm' (If vname kt1 kt2 _) =
  text "if" <+>
  textv vname $$
  text "then" <+>
  ppKTerm 0 kt1 $$
  text "else" <+>
  ppKTerm 0 kt2

ppKTerm' (AssertElseError vname kt1 verr _) =
  text "assert" <+>
  textv vname $$
  text "then" <+>
  ppKTerm 0 kt1 $$
  text "elseError" <+>
  textv verr




appPrec :: Precedence
appPrec = 5000

-- argPrec :: Precedence
-- argPrec = appPrec + 1

maxPrec :: Precedence
maxPrec = 100000

termPrec :: KTerm -> Precedence
termPrec (Halt _ _)       = maxPrec
termPrec (ApplyFun _ _ _) = appPrec
termPrec (KontReturn _ _)    = appPrec
termPrec (If _ _ _ _)        = 0
termPrec (LetSimple _ _ _ _) = 0
-- termPrec (LetCont   _ _)   = 0
termPrec (LetFun    _ _ _)   = 0
--termPrec (Case _ _)        = 0
termPrec (LetRet _ _ _) = 0
termPrec (AssertElseError _ _ _ _) = 0
termPrec (Error _ _) = 0