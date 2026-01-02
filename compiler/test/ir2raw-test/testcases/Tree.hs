
module Tree where

import Util
import RetCPS (VarName(..))
import IR
import qualified Core
import Control.Arrow
import TroupePositionInfo
import qualified Basics


mkP :: IRBBTree -> IRProgram
mkP tree = IRProgram (Core.Atoms []) [Loc NoPos (FunDef (HFN "main") (VN "arg") NoPos [] tree)]

tcs :: [(String, IRProgram)]
tcs = map (second mkP)
  [ ( "TreeEmpty"
    , BB [] (mkLTerm (Ret (mkVPlain "r")))
    )
  ,
    ( "TreeAssign"
    , BB [mkLInst (Assign (VN "r") (Tuple []))] (mkLTerm (Ret (mkVPlain "r")))
    )
  ]
