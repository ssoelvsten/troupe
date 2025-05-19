# What's next 


## Backend / JS runtime integration of the DCLabels
 [ ] Implement backward-compatible parsing of `{alice, bob}` in DC labels to 
     mean ` alice & bob ; alice | bob `. 
     
     - This will allow us to test against the existing codebase.

 [ ] Initiate integration of DC Labels in the runtime.
 
 [ ] Declassification checks and other authority checks (!)

 For the declaration `type DCLabOrConst = Either LabelExp LabelConst`
 change it to a new custom type (easier to track than Left/Right)

## Frontend

 [ ] Add support for #true or #false in the LabelExp parsing, 
     maybe just at the top level?


## Other improvements

 [ ] We should use a separate lexer state for the DC labels, instead of
     the <0> state, because this way we can allow for more symbols to be
     used as in the labels; for as long as we are in the 0th state, we
     cannot use Troupe reserved words, e.g., if / let in the DC Labels. 
    
 [ ] Update string representation: 
     [ ] Printing 
         [ ] printing of CNFs using the & and | syntax
         [ ] printing of DC Labels 

[ ] Serialization

# DONE
## 2025-05-13

[x] Generalize parsing from LabelExp CNF
    to an arbitrary formula that is noramlized by the compiler in a
    desugaring pass.



## 2025-05-15
  [x] Implement a parser for the labelExps that supports
      the syntax  `< alice & bob ; alice | bob >`

  [x] Changes to the representations in the IR, e.g., LabelCNF instead of
      the label, and this way we can carefully add it through the codebase, 
      in an additive way.

  [x] Adding lexer and parser support for DC labels

  [x] In the module DCLabels, implement a function for conversion CNF to JSON  

  [x] Conversion of labels to CNF to JSON somewhere in the pipeline

  [x] Testing of the parser on a few examples

# SCRAP BOOK


## 2025-05-15
-- lblTok (L (AlexPn 0 0 0) (TokenLabel ""))
