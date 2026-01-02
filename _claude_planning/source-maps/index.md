# Source Maps Implementation Plan

## Goal

Implement V3 source maps so all Troupe runtime errors show source location (`filename.trp:LINE:COL`).

**Key Principle**: Modular development - each phase adds functionality without breaking the compiler.

---

## Phase Overview

| Phase | Description                                      | Status   | Link                                                             |
|-------|--------------------------------------------------|----------|------------------------------------------------------------------|
| 0     | Parser filename tracking                         | DONE     | -                                                                |
| 1     | Source map infrastructure                        | DONE     | -                                                                |
| 2     | Stack + PosInf                                   | DONE     | -                                                                |
| 3     | Raw + PosInf                                     | DONE     | -                                                                |
| 4     | IR + PosInf                                      | DONE     | -                                                                |
| 5     | Optimizations preserve positions                 | DONE     | -                                                                |
| 6     | CPS + PosInf                                     | DONE     | -                                                                |
| 7     | Core + PosInf                                    | DONE     | [phase-07-core.md](phase-07-core.md)                             |
| 8     | DirectWOPats + PosInf                            | DONE     | [phase-08-directwopats.md](phase-08-directwopats.md)             |
| 9     | Direct + PosInf                                  | DONE     | [phase-09-direct.md](phase-09-direct.md)                         |
| 10    | Capture positions in Parser                      | DONE     | [phase-10-parser-positions.md](phase-10-parser-positions.md)     |
| 11    | Thread positions through pipeline                | DONE     | [phase-11-threading.md](phase-11-threading.md)                   |
| 12    | Emit real source maps                            | DONE     | [phase-12-emit-source-maps.md](phase-12-emit-source-maps.md)     |
| 13    | Runtime source map resolver                      | NEXT     | [phase-13-runtime-resolver.md](phase-13-runtime-resolver.md)     |
| 14    | Error message positions                          | Pending  | [phase-14-position-params.md](phase-14-position-params.md)       |

---


## Position Threading Gap Analysis

| Layer       | File            | Has PosInf         | Operand Positions |
|-------------|-----------------|--------------------|-------------------|
| Parser AST  | Direct.hs       | **All constructs** | DONE (Phase 10)   |
| Pattern-free| DirectWOPats.hs | **All constructs** | DONE (via CaseElim) |
| Core        | Core.hs         | **All constructs** | DONE (via lower)  |
| CPS         | RetCPS.hs       | **All constructs** | DONE (Phase 6)    |
| IR          | IR.hs           | **All constructs** | DONE (Phase 4)    |
| Raw         | Raw.hs          | **All constructs** | DONE (Phase 3)    |
| Stack       | Stack.hs        | **All constructs** | DONE (Phase 2)    |

---

## Phase Dependencies

```
Phase 12 (Emit real source maps)
    |
Phase 13 (Runtime resolver)
    |
Phase 14 (Error message positions)
```

---

## Key Principles

Each phase:
1. Adds infrastructure (type changes with defaults)
2. Is independently testable (`make test` passes)
3. Produces identical compiler output until positions are captured
4. Can be committed separately

---

## Implementation Progress

### Phase 12: Emit Real Source Maps - COMPLETE (2026-01-01)

**All tests pass (397/397)**

**Files modified**:
- `compiler/src/Stack2JS.hs` - Major changes for source map generation
- `compiler/app/Main.hs` - Updated to use new source map generation

**Source map output**: Valid V3 source maps with VLQ-encoded mappings.

---

### Phases 6-11: COMPLETE

All layers (CPS, Core, DirectWOPats, Direct) now have PosInf on all constructs. Positions flow from Parser through to Stack2JS.

---

## Build Commands

```bash
make compiler   # Build compiler after Haskell changes
make rt         # Build runtime after TypeScript changes
make libs       # Recompile standard libraries (required after compiler changes)
make service    # Recompile service module (required after compiler changes)
make all        # Build everything (compiler, rt, libs, service)
make test       # Run test suite
bin/golden      # Run golden tests
```

**After compiler changes**: Always run `make all && ./bin/golden --quick` to ensure libs and service are recompiled with the new compiler.

---

## Libraries Used

| Component | Library                                                    | Version  | Purpose                  |
|-----------|------------------------------------------------------------|----------|--------------------------|
| Compiler  | [`sourcemap`](https://hackage.haskell.org/package/sourcemap) | >= 0.1.7 | V3 source map generation |
| Runtime   | [`source-map`](https://npmjs.com/package/source-map)       | ^0.7.4   | Parse/resolve source maps |

---

## Root Causes Being Fixed

1. **Parser filename tracking** - DONE
2. **Limited IR positions** - DONE
3. **No CPS positions** - DONE (Phase 6)
4. **No Direct/Core positions** - DONE (Phases 7-9)
5. **Operand positions lost during CPS** - Phase 13 (using optional positions)
6. **Runtime has no way to show source** - Phases 14-15

---

## How to Continue

1. Start with Phase 13a: Add helper types to RetCPS.hs
2. Follow the phase documents in order
3. Run `make all && ./bin/golden --quick` after each phase
4. Each phase should pass all tests before proceeding
