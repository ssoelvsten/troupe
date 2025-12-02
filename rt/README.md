# Troupe Runtime

## Structure

The *src/* folder includes the implementation of Troupe's runtime. At its root
is the key orchestration of the virtual machine runtime, e.g. its *Threads*,
*Scheduler*, *Mailbox* and much more. Next to that, we have the following
subdirectories to separate concerns.

- `src/builtins`: Troupe's builtin functions and operations that are be called
  by the user's program.

- `src/base`: Troupe's base types and values, e.g. `LVal` (labelled value),
  `list`, `record`.

- `src/levels`: The labelled lattice for Troupe's IFC.

- `src/p2p`: The peer-to-peer layer.

There are also a few other folders, `src/dev` and `src/_experiments`. But, they
can be ignored.
