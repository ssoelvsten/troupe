# DONE
## 2026-01-13


- [x] NMIFC

    Add internal methods
    - [x] okToDeclassifyNMIFC and okToEndorseNMIFC

    Make downgrades NMIFC-enforcing in the following order 

    - [x] Value downgrades
    - [x] Blocking label 
    - [x] Mailboxes 

    [x] Can we have NMIFC enforced by default? (If no, what does it mean for the meta-theory?)
    - (yes it is now ON by default)


## 2025-12-27

- [x] Add `--no-v1-labels` / `--v1-labels` runtime options for label output format
      (V1 uses `{}` syntax, non-V1 uses `<>` DC label syntax)

- [x] Add `getCliArgs` builtin for accessing command-line arguments
      (requires root authority, arguments passed after `--` separator)

- [x] Add floating point literal support in compiler frontend

- [x] Replace `DCLabOrConst` type alias with `LabelComponent` data type
      (clearer than `Either LabelExp LabelConst`)

- [x] Upgrade libp2p ecosystem to v3

- [x] Refactor shell scripts: split `troupe-env.sh` (environment setup)
      from `troupe-common.sh` (environment + argument parsing)

- [x] Fix `troupe_parse_args()` to recognize all runtime options
      (was causing CI/CD failures for multinode tests)

## 2025-06-30

- [x] Rename all tests extensions to .trp


## 2025-06-25

- [x | 2025-06-18 ] Add a primitive `blockendorseto` for endorsement of the blocking label
- [x | see _unautomated/blocking for wip ] Create simple examples showcasing why it is needed. 

## 2025-06-17

[x | 2025-06-17] Negative tests for DC label parsing 
     (accomplished with the help of CC)

[x] Add tests for the `cert` function

## 2025-06-07

[x] Lexing and parsing of DC label root/null-conf/integrity literals 

- [x] We should use a separate lexer state for the DC labels, instead of the
  <0> state, because this way we can allow for more symbols to be used as in
  the labels; for as long as we are in the 0th state, we cannot use Troupe
  reserved words, e.g., if / let in the DC Labels. 

[x] Tested a `cert` function

## 2025-06-01

[x] CLI argument refactoring (to confine the dependency on yargs)

## 2025-05-29

[x] Integration of DC Labels in the runtime.

[x] Introduce a downgrade result Enum?

[x] check that OkToDeclassify and okToEndorse
    declassification/endorsement do not 
    modify secrecy/integrity levels
    (use the downgrade result Enum to communicate errors)

- [x] Recheck all the IFC tests (!)


- [x] Split declassification kinds across dimensions 
      and kinds

## 2025-05-27

- [x] Create a module for Downgrading
- [x] Add endorse to the frontend
- [x] Add endorse to the backend
- [x] okToDeclassify and okToEndorse
- [x] Update the current codebase to use okToDeclassify in declassification

## 2025-05-26

- [x] Update earlier tests so that attenuation refers  
  only to the confidentiality dimension.

- [x] Test existing against the existing codebase

- [x] okToDowngrade

- [x] Run test programs from pos/ifc 

- [x] Declassification checks and other authority checks (!)

    - [x] Mailbox clearances

- [x] Run all test programs from pos/core

- [x] Attenuation should be using actsfor instead of flowsTo

- [x] Cache string representation of DC labels 

- [x] Extend the pretty printing of the DC labels to recognize tagsets.

## 2025-05-25

- [x] BUG: `consume01.trp` is blocking
      RESOLUTION: parsing of V1 labels was broken

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

## 2025-05-13

[x] Generalize parsing from LabelExp CNF
    to an arbitrary formula that is noramlized by the compiler in a
    desugaring pass.
# SCRAP BOOK


## 2025-05-15
-- lblTok (L (AlexPn 0 0 0) (TokenLabel ""))
