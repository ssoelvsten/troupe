-- 2020-05-17, AA

-- HACK
-- This module add a number of standard 
-- ambient methods such as `print` to the 
-- beginning of the file. This provides some
-- backward compatibility with prior test cases
-- as well as minimizes some clutter

-- If these methods are unused they are 
-- eliminated by the optimization passes in 
-- the further passes.

module AddAmbientMethods(addAmbientMethods) where 

import Basics
import Direct  
import TroupePositionInfo

printDecl :: FunDecl
printDecl = FunDecl "print"
    [Lambda [VarPattern "x" NoPos] $
        Let [ValDecl (VarPattern "out" NoPos) (App (Var "getStdout" NoPos) [Var "authority" NoPos] NoPos) NoPos]
            (App (Var "fprintln" NoPos) [Tuple [Var "out" NoPos, Var "x" NoPos] NoPos] NoPos) NoPos
    ] NoPos

printWithLabelsDecl :: FunDecl
printWithLabelsDecl = FunDecl "printWithLabels"
    [Lambda [VarPattern "x" NoPos] $
        Let [ValDecl (VarPattern "out" NoPos) (App (Var "getStdout" NoPos) [Var "authority" NoPos] NoPos) NoPos]
            (App (Var "fprintlnWithLabels" NoPos) [Tuple [Var "out" NoPos, Var "x" NoPos] NoPos] NoPos) NoPos
    ] NoPos


printStringDecl :: FunDecl
printStringDecl = FunDecl "printString"
    [Lambda [VarPattern "x" NoPos] $
        Let [ValDecl (VarPattern "out" NoPos) (App (Var "getStdout" NoPos) [Var "authority" NoPos] NoPos) NoPos]
            (App (Var "fwrite" NoPos) [Tuple [Var "out" NoPos, Bin Concat (Var "x" NoPos) (Lit (LString "\\n")) NoPos] NoPos] NoPos) NoPos
    ] NoPos



addAmbientMethods :: Prog -> Prog
addAmbientMethods (Prog imports atoms t) =
    let t' = Let [FunDecs [printDecl,printWithLabelsDecl,printStringDecl]] t NoPos
    in Prog imports atoms t'