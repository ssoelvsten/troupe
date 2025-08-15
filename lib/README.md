# Troupe Standard Library

Unlike the ones implemented in the runtime, `rt/`, this standard library is implemented in Troupe.
This moves them out of the trusted computing base (TCB), i.e. the parts of Troupe that need to be
reviewed rigorously rather than depend on the monitor.

## How to add a new file

To compile a module as part of the standard library, add it to the list of files in the `lib`
target of the *makefile*.
