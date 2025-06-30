This document outlines the plan for adding a wildcard support to Troupe records. What we want is 
to have a possibility to say 

```
let fun (x) = 
  let val {a, ..} = x in a 
  end
``` 

to mean that expression `x` evaluates to 
a record of at least one field, called `a`. 

If the other fields marker `..` is not present, i.e., we have 

```let val {a} = x``` 

it means that we will only pattern match on records with exactly one field `a`.

This will require changing the frontend of the compiler. 

To make things concrete, let's allow the other fields marker in the records to appear only at the end of the record, i.e., `{a, ..}`. 

Note this is a potentially breaking change, and some tests will need to be changed.


### Implementation in CaseElimination.hs

Function `compilePattern` with the case for record patterns, on line 147 
`compilePattern succ (v, S.RecordPattern fieldPatterns mode) = do` 
should implement the following logic. 

- if the pattern mode is ExactMatch then compare the lengths of the record (need to use an appropriate runtime function to get that) with the length of the fieldPatterns. If the length succeed then proceed to compile the patterns, as before. 

- if the pattern mode is WildcardMatch then the functionality should be as before. 

- disallow duplicate field names in the pattern; this should be an error. 


