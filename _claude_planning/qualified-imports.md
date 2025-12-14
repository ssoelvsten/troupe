We want to refactor the syntax for imports, so we have

`import qualified <lib-name>` to mean 

that if the library <lib-name> contains a function foo, we can only refer to 
it via <lib-name>.foo 

This will require changing in the parser, so that we are aware of the qualified imports. 

The problem is that we already use the dot notation for records, so we need to 
be able to disambiguate.  For example, if we have module A that exports functionality foo

import qualified A

let val A = {foo}

then subsequently when we have A.foo, it means that we are overshadowing the declaration of A.


this may be ok, but we need to work this out and document everything carefully.

Let's start off by 

- creating two libraries for testing purposes, each exporting function foo. 

- these will be libraires A and B that we will place into the /lib folder. 

- let each of these libraries declare function `foo` that returns "A" and "B" respectively.

- we want then to create a test functionality that clearly demonstrates the problem 


```
import qualified A
import qualified B

foo ()
```

the problem in this code should be that there would be no way of referring to call A.foo anymore. 

Let's do as follows.

Help me proceeding with above, so we reach a point where we have a clear demonstration of the problem. 
