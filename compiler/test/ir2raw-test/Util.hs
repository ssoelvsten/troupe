module Util where

import qualified IR
import RetCPS (VarName(..))
import TroupePositionInfo (Located(Loc), PosInf(..))

-- Create a Located VarAccess with NoPos for test purposes
-- This is used in expressions which now expect LVarAccess
mkV :: String -> IR.LVarAccess
mkV s = Loc NoPos (IR.VarLocal (VN s))

-- Create a plain VarAccess for places that still need it (e.g., terminators, MkFunClosures)
mkVPlain :: String -> IR.VarAccess
mkVPlain s = IR.VarLocal (VN s)

-- Wrap an instruction with NoPos
mkLInst :: IR.IRInst -> IR.LIRInst
mkLInst inst = Loc NoPos inst

-- Wrap a terminator with NoPos
mkLTerm :: IR.IRTerminator -> IR.LIRTerminator
mkLTerm term = Loc NoPos term