# What's next 

## Backend / JS runtime integration of the DCLabels

[ ] BUG: `consume01.trp` is blocking

[+ongoing+] Integration of DC Labels in the runtime.

[ ] Declassification checks and other authority checks (!)

[+ongoing+] Test existing against the existing codebase (see the progress below)

### Integrity integration progress list

- [ x | 2025-05-25 ] `zero.trp`           
- [ x | 2025-05-25 ] `fib.trp`            
- [ x | 2025-05-25 ] `infoflow01.trp`   
 

## Frontend

- [ ] Note that the way the edge labels are printed in by the runtime is
  currently different from how they are supposed to be parsed.  This may or may
  not be okay; we can talk about implementing context-depending parsing as part
  of the frontend

- [ ] Add support for context-depending #null, #root - style parsing in the
  LabelExp parsing and lexing

### Other improvements

- [ ] We should use a separate lexer state for the DC labels, instead of the
  <0> state, because this way we can allow for more symbols to be used as in
  the labels; for as long as we are in the 0th state, we cannot use Troupe
  reserved words, e.g., if / let in the DC Labels. 

## Refactoring

### Runtime 

- [ ] Get rid of lubs in the runtime codebase, because it is redundant, now that 
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

### Compiler

- [ ] For the declaration `type DCLabOrConst = Either LabelExp LabelConst`
  change it to a new custom type (easier to track than Left/Right)

## Dependency management

- [ ] Upgrade all libp2p dependencies.
- [ ] "skipLibCheck" in tsconfig should be set back to false (or removed).

    
## Serialization 

- [ ] Serialization

# DONE

## 2025-05-25

- [x] Backward-compatible printing for the bottom-level

- [x] Implement actsfor primitives in the DCLabel

- [x] Main authority value given in the beginning of the program should be ROOT
 
 
## 2025-05-25
- [x] Update string representation: 
      [x] Printing 
          [x] printing of CNFs using the & and | syntax
          [x] printing of DC Labels 
      [x] Security-context--depending printing of the CNF formulas
         gives better intuition than true/false literals or 
         any combination of symbols that I could find at the moment.
         

-  [x] Implement backward-compatible parsing of `{alice, bob}` in DC labels to 
       mean ` alice & bob ; alice | bob `. 

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
