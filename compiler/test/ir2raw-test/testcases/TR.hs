module TR where

import Util
import RetCPS (VarName(..))
import IR
import qualified Core
import Control.Arrow
import TroupePositionInfo


mkP :: IRTerminator -> IRProgram
mkP tr = IRProgram (Core.Atoms []) [FunDef (HFN "main") (VN "arg") NoPos [] body NoPos]
  where body = BB [] tr

tcs :: [(String, IRProgram)]
tcs = map (second mkP)
  [
  ( "TailCall"
  , TailCall (mkV "x") (mkV "y") NoPos
  ),
  ( "Ret"
  , Ret (mkV "x") NoPos
  ),
  ( "LibExport"
  , LibExport (mkV "x") NoPos
  ),
  -- NOTE: We use libexport as terminator because it generates least extra code
  ( "If"
  , If (mkV "x")
       (BB [Assign (VN "b1") (Base "v1") NoPos] (LibExport (mkV "b1") NoPos))
       (BB [Assign (VN "b2") (Base "v2") NoPos] (LibExport (mkV "b2") NoPos))
       NoPos
  ),
  ( "StackExpand"
  , StackExpand (VN "x")
       (BB [Assign (VN "b1") (Base "v1") NoPos] (LibExport (mkV "b1") NoPos))
       (BB [Assign (VN "b2") (Base "v2") NoPos] (LibExport (mkV "b2") NoPos))
       NoPos
  ),
  ( "AssertElseError"
  , AssertElseError (mkV "x") (BB [Assign (VN "b") (Base "v") NoPos] (LibExport (mkV "b") NoPos)) (mkV "verr") NoPos
  ),
  ( "Error"
  , Error (mkV "verr") NoPos
  )
  ]
