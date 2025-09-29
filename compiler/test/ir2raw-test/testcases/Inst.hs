module Inst where

import qualified Basics
import Control.Arrow
import qualified Core
import IR
import RetCPS (VarName (..))
import TroupePositionInfo
import Util

mkP :: IRInst -> IRProgram
mkP inst = IRProgram (Core.Atoms []) [FunDef (HFN "main") (VN "arg") [] body]
  where
    body = BB [inst] (LibExport (mkV "r"))

tcs :: [(String, IRProgram)]
tcs =
    map
        (second mkP)
        [
            ( "AssignSimple"
            , Assign (VN "r") (Const $ Core.LInt 123 NoPos)
            )
        ,
            ( "AssignOp"
            , Assign (VN "r") (Bin Basics.Plus (mkV "x") (mkV "y"))
            )
        ,
            ( "AssignEq"
            , Assign (VN "r") (Bin Basics.Eq (mkV "x") (mkV "y"))
            )
        ,
            ( "MkFunClosures"
            , MkFunClosures [(VN "x", mkV "r")] [(VN "f", HFN "f123")]
            )
        ]
