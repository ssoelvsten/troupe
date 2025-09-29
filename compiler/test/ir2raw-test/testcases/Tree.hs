module Tree where

import qualified Basics
import Control.Arrow
import qualified Core
import IR
import RetCPS (VarName (..))
import TroupePositionInfo
import Util

mkP :: IRBBTree -> IRProgram
mkP tree = IRProgram (Core.Atoms []) [FunDef (HFN "main") (VN "arg") [] tree]

tcs :: [(String, IRProgram)]
tcs =
    map
        (second mkP)
        [
            ( "TreeEmpty"
            , BB [] (Ret (mkV "r"))
            )
        ,
            ( "TreeAssign"
            , BB [Assign (VN "r") (Tuple [])] (Ret (mkV "r"))
            )
        ]
