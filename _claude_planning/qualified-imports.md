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

---

## Completed Demonstration (2024-12-14)

### Created Files

- `/lib/A.trp` - exports `foo` returning "A"
- `/lib/B.trp` - exports `foo` returning "B"
- `/tests/_unautomated/claude/qualified_import_demo.trp`
- `/tests/_unautomated/claude/qualified_import_desired.trp`
- `/tests/_unautomated/claude/qualified_shadowing_demo.trp`

### Test Results

| Test                            | Output           | Behavior                                            |
|---------------------------------|------------------|-----------------------------------------------------|
| `qualified_import_demo.trp`     | `"B"`            | Last import wins - A's foo is inaccessible          |
| `qualified_import_desired.trp`  | `"B"`            | Same - no way to access both foo functions          |
| `qualified_shadowing_demo.trp`  | `"local record"` | Local variable `val A = {...}` shadows library name |

### Confirmed Problems

1. **Name collision**: When both A and B export `foo`, only B's (last import) is accessible
2. **No qualified access**: Without records, we cannot write `A.foo()` to disambiguate
3. **Shadowing**: When `val A = {...}` is defined, `A.foo` refers to the local record

### Next Steps (Phase 2 - Parser Implementation)

1. Add `qualified` keyword to `compiler/src/Lexer.x`
2. Update grammar in `compiler/src/Parser.y` for `import qualified VAR`
3. Extend `Imports` in `compiler/src/Basics.hs` to track qualification flag
4. Update renaming in `compiler/src/Core.hs` to enforce qualified access 
