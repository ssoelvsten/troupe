module TR where

import Util
import RetCPS (VarName(..))
import IR
import qualified Core
import Control.Arrow
import TroupePositionInfo


mkP :: IRTerminator -> IRProgram
mkP tr = IRProgram (Core.Atoms []) [Loc NoPos (FunDef (HFN "main") (VN "arg") NoPos [] body)]
  where body = BB [] (mkLTerm tr)

tcs :: [(String, IRProgram)]
tcs = map (second mkP)
  [
  ( "TailCall"
  , TailCall (mkVPlain "x") (mkVPlain "y")
  ),
  ( "Ret"
  , Ret (mkVPlain "x")
  ),
  ( "LibExport"
  , LibExport (mkVPlain "x")
  ),
  -- NOTE: We use libexport as terminator because it generates least extra code
  ( "If"
  , If (mkVPlain "x")
       (BB [mkLInst (Assign (VN "b1") (Base "v1"))] (mkLTerm (LibExport (mkVPlain "b1"))))
       (BB [mkLInst (Assign (VN "b2") (Base "v2"))] (mkLTerm (LibExport (mkVPlain "b2"))))
  ),
  ( "StackExpand"
  , StackExpand (VN "x")
       (BB [mkLInst (Assign (VN "b1") (Base "v1"))] (mkLTerm (LibExport (mkVPlain "b1"))))
       (BB [mkLInst (Assign (VN "b2") (Base "v2"))] (mkLTerm (LibExport (mkVPlain "b2"))))
  ),
  ( "AssertElseError"
  , AssertElseError (mkVPlain "x") (BB [mkLInst (Assign (VN "b") (Base "v"))] (mkLTerm (LibExport (mkVPlain "b")))) (mkVPlain "verr") NoPos
  ),
  ( "Error"
  , Error (mkVPlain "verr") NoPos
  )
  ]
