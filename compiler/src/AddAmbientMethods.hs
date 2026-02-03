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
import TroupePositionInfo (Located(..), PosInf(..), noLoc)

-- Helper to create Located values at NoPos
lp :: a -> Located a
lp = Loc NoPos

-- Helper to create Located patterns at NoPos
lpat :: DeclPattern -> LDeclPattern
lpat = lp

-- Helper to create Located terms at NoPos
lterm :: Term -> LTerm
lterm = lp

printDecl :: LFunDecl
printDecl = lp $ FunDecl "print"
    [Lambda [lpat (VarPattern "x")] $
        lterm $ Let [ValDecl (lpat (VarPattern "out"))
                             (lterm (App (lterm (Var "getStdout")) [lterm (Var "authority")]))]
            (lterm (App (lterm (Var "fprintln")) [lterm (Tuple [lterm (Var "out"), lterm (Var "x")])]))
    ]

printWithLabelsDecl :: LFunDecl
printWithLabelsDecl = lp $ FunDecl "printWithLabels"
    [Lambda [lpat (VarPattern "x")] $
        lterm $ Let [ValDecl (lpat (VarPattern "out"))
                             (lterm (App (lterm (Var "getStdout")) [lterm (Var "authority")]))]
            (lterm (App (lterm (Var "fprintlnWithLabels")) [lterm (Tuple [lterm (Var "out"), lterm (Var "x")])]))
    ]


printStringDecl :: LFunDecl
printStringDecl = lp $ FunDecl "printString"
    [Lambda [lpat (VarPattern "x")] $
        lterm $ Let [ValDecl (lpat (VarPattern "out"))
                             (lterm (App (lterm (Var "getStdout")) [lterm (Var "authority")]))]
            (lterm (App (lterm (Var "fwrite"))
                        [lterm (Tuple [lterm (Var "out"),
                                       lterm (Bin Concat (lterm (Var "x")) (lterm (Lit (LString "\\n"))))])]))
    ]



addAmbientMethods :: Prog -> Prog
addAmbientMethods (Prog imports atoms t) =
    let t' = lterm $ Let [FunDecs [printDecl,printWithLabelsDecl,printStringDecl]] t
    in Prog imports atoms t'
