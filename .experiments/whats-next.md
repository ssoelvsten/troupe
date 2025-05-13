# What's next 

[ ] Lexing / parsing of the labels in the surface language to JSON 
    - [ ] Implement a parser for the labelExps that supports
          the syntax  `< alice & bob ; alice | bob >`
          and that converts to CNF somewhere in the pipeline
    - [ ] This requires a new representation in the IR, e.g., LabelCNF instead of
          the label, and this way we can carefully add it through the codebase, 
          in an additive way.
    - [ ] We will require changing to lexer, parser.
    - [ ] We will need to look into how to change the declassification authority 
        checks, etc.

[ ] DCLabels.CNF to JSON 

[ ] We should use a separate lexer state for the DC labels, instead of
    the <0> state, because this way we can allow for more symbols to be
    used as in the labels; for as long as we are in the 0th state, we
    cannot use Troupe reserved words, e.g., if / let in the DC Labels. 
    
[ ] Update string representation: 
    [ ] Printing 
        [ ] printing of CNFs using the & and | syntax
        [ ] printing of DC Labels 

[ ] Later, potentially as a student project, generalize parsing from CNF
    to an arbitrary formula that is noramlized by the compiler in a
    desugaring pass.

[ ] Backward-compatible version of the compiler to make sure that the
    local tests work

    - [ ] Implement backward-compatible parsing of `{alice, bob}` in DC labels to 
          mean ` alice & bob ; alice | bob `. This will allow us to test against 
          the existing codebase.

[ ] Serialization