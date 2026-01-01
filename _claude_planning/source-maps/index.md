# Source Maps Implementation Plan

## Goal

Implement V3 source maps so all Troupe runtime errors show source location (`filename.trp:LINE:COL`).

**Key Principle**: Modular development - each phase adds functionality without breaking the compiler.

---

## Phase Overview

| Phase | Description | Files | Status | Link |
|-------|-------------|-------|--------|------|
| 0 | Parser filename tracking | Parser.y, Main.hs | DONE | - |
| 1 | Source map infrastructure | Main.hs, TroupeSourceMap.hs | DONE | - |
| 2 | Stack + PosInf | Stack.hs, Raw2Stack.hs, Stack2JS.hs | DONE | - |
| 3 | Raw + PosInf | Raw.hs, IR2Raw.hs, Raw2Stack.hs, RawOpt.hs | DONE | - |
| 4 | IR + PosInf | IR.hs, ClosureConv.hs, IR2Raw.hs, IROpt.hs | DONE | - |
| 5 | Optimizations preserve positions | IROpt.hs, CPSOpt.hs, RawOpt.hs | DONE | - |
| 6 | CPS + PosInf | RetCPS.hs, RetDFCPS.hs, CPSOpt.hs, etc. | DONE | - |
| 7 | Core + PosInf | Core.hs, RetDFCPS.hs | DONE | [phase-07-core.md](phase-07-core.md) |
| 8 | DirectWOPats + PosInf | DirectWOPats.hs, CaseElimination.hs | DONE | [phase-08-directwopats.md](phase-08-directwopats.md) |
| 9 | Direct + PosInf | Direct.hs, Parser.y | DONE | [phase-09-direct.md](phase-09-direct.md) |
| 10 | Capture positions in Parser | Parser.y | DONE | [phase-10-parser-positions.md](phase-10-parser-positions.md) |
| 11 | Thread positions through pipeline | CaseElimination.hs, Core.hs, etc. | **NEXT** | [phase-11-threading.md](phase-11-threading.md) |
| 12 | Emit real source maps | Stack2JS.hs, Main.hs | Pending | [phase-12-emit-source-maps.md](phase-12-emit-source-maps.md) |
| 13 | Runtime source map resolver | SourceMapResolver.mts, Thread.mts | Pending | [phase-13-runtime-resolver.md](phase-13-runtime-resolver.md) |
| 14 | Error message positions | Asserts.mts, BuiltinArith.mts | Pending | [phase-14-position-params.md](phase-14-position-params.md) |

---

## Position Threading Gap Analysis

| Layer | File | Has PosInf | Missing PosInf |
|-------|------|------------|----------------|
| Parser AST | Direct.hs | **All constructs** | - |
| Pattern-free | DirectWOPats.hs | **All constructs** | - |
| Core | Core.hs | **All constructs** | - |
| CPS | RetCPS.hs | **All constructs** | - |
| IR | IR.hs | **All constructs** | - |
| Raw | Raw.hs | **All constructs** | - |
| Stack | Stack.hs | **All constructs** | - |

---

## Phase Dependencies

```
Phase 7 (Core types)
    |
Phase 8 (DirectWOPats types)
    |
Phase 9 (Direct types + Parser infrastructure)
    |
Phase 10 (Parser captures real positions)
    |
Phase 11 (Thread positions through pipeline)
    |
Phase 12 (Emit real source maps)
    |
Phase 13 (Runtime resolver)
    |
Phase 14 (Direct position parameters)
```

---

## Key Principles

Each phase:
1. Adds infrastructure (type changes, NoPos defaults)
2. Is independently testable (`make test` passes)
3. Produces identical compiler output until Phase 11-12
4. Can be committed separately

---

## Implementation Progress

### Phase 10: Capture Positions in Parser - COMPLETE (2026-01-01)

**All tests pass (397/397)**

**Files modified**:
- `compiler/src/Parser.y` - Updated grammar rules to capture real source positions:
  - Binary operators (all 24 operators including +, -, *, /, div, mod, comparisons, logical, bitwise, concat, raisedTo, ::)
  - Unary operators (isTuple, isList, isRecord, not, unary minus)
  - If-then-else, Let bindings, Seq expressions
  - Fn (lambda) and Hn (handler) expressions
  - Var references, Tuples, Records, WithRecord, Lists
  - Field projections (ProjField, ProjIdx)
  - Updated mkSeq helper to accept position parameter

---

### Phase 9: Direct + PosInf - COMPLETE (2026-01-01)

**All tests pass (397/397)**

**Files modified**:
- `compiler/src/Direct.hs` - Added `PosInf` to 17 Term constructors (Var, Abs, Hnd, App, Let, If, Tuple, Record, WithRecord, ProjField, ProjIdx, List, ListCons, Bin, Un, Seq, Error), updated pretty printer and termPrec functions
- `compiler/src/Parser.y` - Updated all grammar rules to pass `NoPos` for new PosInf fields, updated helper functions (piniDecl, mkSeq, fromFact)
- `compiler/src/CaseElimination.hs` - Updated all pattern matches and term construction to handle new PosInf fields from Direct.hs
- `compiler/src/AtomFolding.hs` - Updated all visitTerm pattern matches for new PosInf fields
- `compiler/src/AddAmbientMethods.hs` - Updated ambient method declarations with NoPos for new PosInf fields
- `compiler/src/Exports.hs` - Updated pattern matches in extractMain and checkOne for new PosInf fields

---

### Phase 8: DirectWOPats + PosInf - COMPLETE (2026-01-01)

**All tests pass (397/397)**

**Files modified**:
- `compiler/src/DirectWOPats.hs` - Added `PosInf` to 14 Term constructors (Var, Abs, App, Let, If, Tuple, Record, WithRecord, ProjField, ProjIdx, List, ListCons, Bin, Un), updated pretty printer and termPrec functions
- `compiler/src/CaseElimination.hs` - Updated all pattern compilation and term transformation to pass `NoPos` for new PosInf fields
- `compiler/src/Core.hs` - Updated `lower` function to propagate PosInf from DirectWOPats to Core (positions now flow through instead of being discarded)

---

### Phase 7: Core + PosInf - COMPLETE (2026-01-01)

**All tests pass (397/397)**

**Files modified**:
- `compiler/src/Core.hs` - Added `PosInf` to 14 Term constructors (Var, Abs, App, Let, If, Tuple, Record, WithRecord, ProjField, ProjIdx, List, ListCons, Bin, Un), updated `lower`, `rename`, and pretty printer functions
- `compiler/src/RetDFCPS.hs` - Updated all pattern matches for Core types with new PosInf fields

---

### Phase 6: CPS + PosInf - COMPLETE (2026-01-01)

**All tests pass (397/397)**

**Files modified**:
- `compiler/src/RetCPS.hs` - Added `PosInf` to SimpleTerm and KTerm constructors
- `compiler/src/RetDFCPS.hs` - Updated all CPS term construction to pass `NoPos`
- `compiler/src/CPSOpt.hs` - Updated all pattern matches for new PosInf fields
- `compiler/src/ClosureConv.hs` - Updated pattern matches for CPS types
- `compiler/src/RetRewrite.hs` - Updated pattern matches for CPS types
- `compiler/src/RetFreeVars.hs` - Updated pattern matches for CPS types

---

## Build Commands

```bash
make compiler   # Build compiler after Haskell changes
make rt         # Build runtime after TypeScript changes
make test       # Run test suite
bin/golden      # Run golden tests
```

---

## Libraries Used

| Component | Library | Version | Purpose |
|-----------|---------|---------|---------|
| Compiler | [`sourcemap`](https://hackage.haskell.org/package/sourcemap) | >= 0.1.7 | V3 source map generation |
| Runtime | [`source-map`](https://npmjs.com/package/source-map) | ^0.7.4 | Parse/resolve source maps |

---

## Root Causes Being Fixed

1. **Parser filename tracking** - DONE - Parser uses ReaderT monad to thread filename
2. **Limited IR positions** - DONE - All IR/Raw/Stack types have PosInf
3. **No CPS positions** - DONE - All CPS types have PosInf (Phase 6)
4. **No Direct/Core positions** - DONE - All Direct/DirectWOPats/Core types have PosInf (Phases 7-9)
5. **Runtime has no way to show source** - Phases 13-14

---

## How to Continue

See [handoff.md](handoff.md) for instructions on starting each phase.
