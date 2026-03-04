# Testing infrastructure for Troupe

We assume that the existence of `tests` directory with the following structure:

        tests
        ├── cmp                   (* negative tests for the compiler *)
        └── rt                    (* other tests; all should be ok by compiler *)
            ├── neg               (* negative runtime tests *)
            │   ├── core
            │   └── ifc
            ├── pos               (* positive runtime tests *)
            │   ├── core
            │   └── ifc
            └── timeout
                ├── blocking
                └── diverging

We further distinguish between core and ifc tests, in each category of positive and negative tests.
There is a fair amount of redundancy in the core positive runtime tests, and they would benefit from
a cleanup pass.

## Negative tests for the compiler

The compiler should return the exit code 1 when it fails

## Negative tests for the runtime

Error messages from the runtime are generally printed out in the console
as part of the normal output.

## Termination of the runtime

We invoke the tests using `./local.sh` script that does not activate
the p2p infrastructure.

## Per-test options

Tests can specify additional arguments to pass to `./local.sh` by creating
a `.options` file alongside the test file.

### File naming

Following the pattern for `.input` files:
- Test file: `mytest.trp`
- Input file: `mytest.trp.input` (for stdin)
- Options file: `mytest.trp.options` (for extra arguments)

### Options file format

The options file uses shell-style argument syntax (parsed with the `shellwords`
package). Lines starting with `#` are treated as comments.

Example - passing CLI arguments to the program:
```
-- hello world "quoted arg"
```

Example - passing runtime options:
```
--label-format v2
```

The arguments are appended after the test filename when invoking `./local.sh`.
