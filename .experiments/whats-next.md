# What's next 


[ ] Lexing / parsing of the labels in the surface language to JSON 
 -  [ ] Implement a parser for the CNF new syntax only  `< alice & bob ; alice | bob >`
 -  [ ] This requires a new representation in the IR, e.g., LabelCNF instead of
        the label, and this way we can carefully add it through the codebase, 
        in an additive way.
  [ ] We will require changing to lexer, parser.
  [ ] We will need to look into how to change the declassification authority checks, etc.
  

[ ] Update string representation: 
    [ ] Printing 
      [ ] printing of CNFs using the & and | syntax
      [ ] printing of DC Labels 

[ ] Later, potentially as a student project, generalize parsing 
    from CNF to an arbitrary formula that is noramlized by the 
    compiler in a desugaring pass.

[ ] Backward-compatible version of the compiler to make sure that 
    the local tests work

    - [ ] Implement backward-compatible parsing of `{alice, bob}` in DC labels to 
          mean ` alice & bob ; alice | bob `. This will allow us to test against 
          the existing codebase.

[ ] Serialization 

