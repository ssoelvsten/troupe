-- A standalone executable for testing the dc label and other integrity
-- related components of Troupe 2, 2025-05-13
{-# OPTIONS_GHC -Wno-unrecognised-pragmas #-}

{-# HLINT ignore "Redundant bracket" #-}

import DCLabels

(\/) = OpExp Disj
(/\) = OpExp Conj

t = TagExp

labexp01 :: LabelExp
labexp01 = (t "alice") \/ ((t "bob") /\ t "dorothy") \/ (t "charlie")
labexp02 = (t "alice") /\ (t "bob") /\ (t "charlie")
labexp03 = (t "alice") /\ ((t "bob") \/ (t "charlie"))

main = do
    print (labexp01)
    print (labelExpToCNF labexp01)
    print (labexp02)
    print (labelExpToCNF labexp02)
    print (labexp03)
    print (labelExpToCNF labexp03)
