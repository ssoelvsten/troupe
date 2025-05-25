# What's next 

## Backend / JS runtime integration of the DCLabels

 [ ] There is a bug in the join implementation somewhere right now
 
 [+ongoing+] Initiate integration of DC Labels in the runtime.

 [+ongoing+] Implement backward-compatible parsing of `{alice, bob}` in DC labels to 
     mean ` alice & bob ; alice | bob `. 
 
 [ ] Declassification checks and other authority checks (!)

 For the declaration `type DCLabOrConst = Either LabelExp LabelConst`
 change it to a new custom type (easier to track than Left/Right)

 [ ] Test existing against the existing codebase (see the progress below)

### Integrity integration progress list

 [ x | 2025-05-25 ] `zero.trp`           
 [ x | 2025-05-25 ] `fib.trp`            
 [   | 2025-05-25 ] `infoflow01.trp`   


## Frontend

 [ ] Add support for #true or #false in the LabelExp parsing, 
     maybe just at the top level?

## Refactoring

- [ ] Get rid of lubs, because it is redundant, now that 
  we have a multi-arg lub

- [ ] Refactor the interface for AbstractLevelSystem
  - use `lub2` , `glb2` for binary operations 
  - define abstract overridable `lub` `glb` that do 
    the obvious thing of iterating over the list and 
    computing the results using pairwise applications of 
    lub2, glb2; and allow for improved implementations in the
    classes (e.g., the way it is done in tagsets)
   
    | the only reason this is not done right now 
    | is that it may be difficult to test it exhaustively 
    | and it is not the biggest of the priorities. 

## Dependency management

- [ ] Upgrade all libp2p dependencies.
- [ ] "skipLibCheck" in tsconfig should be set back to false (or removed).

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

## 2025-05-24

[x] Refactor the existing Level interface to
something more maintainable in the anticipation of the integration of the DCLabels. 

   -  move individual exports into the level module? 


## 2025-05-21

[x] Move DCLabels into the rt/levels and check that they compile as part 
     of the Troupe codebase.  

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
