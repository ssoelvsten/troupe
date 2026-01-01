{-# LANGUAGE DefaultSignatures #-}
{-# LANGUAGE DeriveGeneric     #-}
{-# LANGUAGE TypeSynonymInstances #-}
{-# LANGUAGE FlexibleInstances #-}


module Stack 
where


import qualified Basics
import           RetCPS (VarName (..))
import           IR ( Identifier(..)
                    , VarAccess(..), HFN (..), Fields (..), Ident
                    , ppId,ppFunCall,ppArgs
                    )
import qualified IR (FunDef (..))
import Raw (RawExpr (..), RawType(..), RawVar (..), MonComponent(..),
            ppRawExpr, Assignable (..), Consts, ppConsts, RTAssertion(..), ppRTAssertion)

import qualified Core                      as C
import qualified RetCPS                    as CPS


import           Control.Monad.Except
import           Control.Monad.Reader
import           Control.Monad.RWS
import           Control.Monad.State
import           Control.Monad.Writer
import           Data.List
import qualified Data.ByteString           as BS

import           Text.PrettyPrint.HughesPJ (hsep, nest, text, vcat, ($$), (<+>))
import qualified Text.PrettyPrint.HughesPJ as PP
import           TroupePositionInfo



data StackBBTree = BB [StackInst] StackTerminator deriving (Eq, Show)



data StackTerminator
  = TailCall RawVar PosInf
  | Ret PosInf
  | If RawVar StackBBTree StackBBTree PosInf
  | LibExport VarAccess PosInf
  | Error RawVar PosInf
  | StackExpand StackBBTree StackBBTree PosInf
  deriving (Eq, Show)



type StackPos = Int
data EscapesBlock = NotEscaping
            | Escaping StackPos
            deriving (Eq, Show)


data RawAssignType = AssignConst | AssignLet | AssignMut deriving (Eq, Ord, Show)


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

-- Function definition
data FunDef = FunDef 
                    HFN         -- name of the function     
                    Int         -- frame size     
                    Raw.Consts      -- constant literars
                    StackBBTree    -- body
                    IR.FunDef    -- original definition for serialization
                deriving (Eq)

-- An IR program is just a collection of atoms declarations 
-- and function definitions
data StackProgram = StackProgram C.Atoms [FunDef] 

data StackUnit 
  = FunStackUnit FunDef 
  | AtomStackUnit C.Atoms 
  | ProgramStackUnit StackProgram

-----------------------------------------------------------
-- PRETTY PRINTING
-----------------------------------------------------------

ppProg (StackProgram atoms funs) =
  vcat $ (map ppFunDef funs)

instance Show StackProgram where
  show = PP.render.ppProg

ppFunDef ( FunDef hfn _ consts insts _ )
  = vcat [ text "func" <+> ppFunCall (ppId hfn) [] <+> text "{"
         , nest 2 (ppConsts consts)
         , nest 2 (ppBB insts)
         , text "}"]



qqFields fields =
  PP.hsep $ PP.punctuate (text ",") (map ppField fields)
    where 
      ppField (name, v) = 
        PP.hcat [PP.text name, PP.text "=", ppId v]

ppEsc esc =
  case esc of 
    NotEscaping -> PP.empty
    Escaping x -> PP.text "*" <+> PP.text (show x )


ppIR :: StackInst -> PP.Doc
ppIR (SetBranchFlag _) = text "<setbranchflag>"
ppIR (InvalidateSparseBit _) = text "<invalidate sparse bit>"
ppIR (AssignRaw _ vn st _) = ppId vn <+> text "=" <+> ppRawExpr st
ppIR (AssignLVal vn expr _) =
  ppId vn <+> text "=" <+> ppRawExpr expr
ppIR (RTAssertion a _) = ppRTAssertion a

ppIR (SetState comp v _) =
  ppId comp <+> text "<-" <+> ppId v
ppIR (FetchStack x i _) =
  ppId x <+> text "<- $STACK[" PP.<> text (show i) PP.<> text "]"
ppIR (StoreStack x i _) =
  text "$STACK[" PP.<> text (show i) PP.<> text "] = " <+> ppId x


ppIR (MkFunClosures varmap fdefs _) =
    let vs = hsepc $ ppEnvIds varmap
        ppFdefs = map (\((VN x), HFN y) ->  text x <+> text "= mkClos" <+> text y ) fdefs
     in text "with env:=" <+> PP.brackets vs $$ nest 2 (vcat ppFdefs)
    where ppEnvIds ls =
            map (\(a,b) -> (ppId a) PP.<+> text "->" <+> ppId b ) ls
          hsepc ls = PP.hsep (PP.punctuate (text ",") ls)


ppIR (LabelGroup insts _) =
 text "group" $$ nest 2 (vcat (map ppIR insts))

ppTr (StackExpand bb1 bb2 _) = (text "= call" $$ nest 2 (ppBB bb1)) $$ (ppBB bb2)


-- ppTr (AssertElseError va ir va2 _)
--   = text "assert" <+> PP.parens (ppId va) <+>
--     text "{" $$
--     nest 2 (ppBB ir) $$
--     text "}" $$
--     text "elseError" <+> (ppId va2)


ppTr (If va ir1 ir2 _)
  = text "if" <+> PP.parens (ppId va) <+>
    text "{" $$
    nest 2 (ppBB ir1) $$
    text "}" $$
    text "else {" $$
    nest 2 (ppBB ir2) $$
    text "}"
ppTr (TailCall va1 _) = ppFunCall (text "tail") [ppId va1]
ppTr (Ret _)  = ppFunCall (text "ret") []
ppTr (LibExport va _) = ppFunCall (text "export") [ppId va]
ppTr (Error va _)  = (text "error") <> (ppId va)


ppBB (BB insts tr) = vcat $ (map ppIR insts) ++ [ppTr tr]
