# Source Maps Implementation Plan

## Goal

Implement V3 source maps so all Troupe runtime errors show source location (`filename.trp:LINE:COL`).

**Key Principle**: Modular development - each phase adds functionality without breaking the compiler.

---

## Current Status (2026-01-03)

**Active proposal**: [status-4.md](status-4.md) - Complete Source Position Solution

Phases 0-12 are complete. The remaining work has two parts:

1. **Static code**: Use inline source maps with Node.js's `--enable-source-maps` (automatic translation)
2. **Dynamic code**: Extend compiler JSON output with source maps, merge per-namespace at runtime, translate stack traces manually

See [status-4.md](status-4.md) for the complete proposal and implementation plan.

---

## Phase Overview

| Phase | Description                                      | Status      | Link                                                             |
|-------|--------------------------------------------------|-------------|------------------------------------------------------------------|
| 0     | Parser filename tracking                         | DONE        | -                                                                |
| 1     | Source map infrastructure                        | DONE        | -                                                                |
| 2     | Stack + PosInf                                   | DONE        | -                                                                |
| 3     | Raw + PosInf                                     | DONE        | -                                                                |
| 4     | IR + PosInf                                      | DONE        | -                                                                |
| 5     | Optimizations preserve positions                 | DONE        | -                                                                |
| 6     | CPS + PosInf                                     | DONE        | -                                                                |
| 7     | Core + PosInf                                    | DONE        | [phase-07-core.md](phase-07-core.md)                             |
| 8     | DirectWOPats + PosInf                            | DONE        | [phase-08-directwopats.md](phase-08-directwopats.md)             |
| 9     | Direct + PosInf                                  | DONE        | [phase-09-direct.md](phase-09-direct.md)                         |
| 10    | Capture positions in Parser                      | DONE        | [phase-10-parser-positions.md](phase-10-parser-positions.md)     |
| 11    | Thread positions through pipeline                | DONE        | [phase-11-threading.md](phase-11-threading.md)                   |
| 12    | Emit real source maps                            | DONE        | [phase-12-emit-source-maps.md](phase-12-emit-source-maps.md)     |
| 13    | Runtime source map resolver                      | SKIPPED     | [phase-13-runtime-resolver.md](phase-13-runtime-resolver.md)     |
| 14    | Error message positions                          | SUPERSEDED  | [phase-14-position-params.md](phase-14-position-params.md)       |
| 16    | **Complete source position solution**            | **NEXT**    | [status-4.md](status-4.md)                                       |

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

### Phase 13: Runtime Source Map Resolver - SKIPPED (2026-01-02)

**All tests pass (397/397)**

**Files modified**: None

**Key insight**: Phase 13 is not needed. After recognizing that Troupe's call stack is independent of JavaScript's stack trace, and that threads can execute code from multiple sources, we determined that runtime source map resolution is the wrong approach. Instead, position strings will be passed directly from the compiler as parameters (Phase 14). This is simpler, more accurate, and faster than runtime resolution.

---

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
| Dev Tools | [`source-map`](https://npmjs.com/package/source-map) (dev) | ^0.7.4   | Inspect source maps (debugging tool) |

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

Follow [status-4.md](status-4.md) Phase 16 implementation plan:

### Static Code (Quick Win)
1. **Phase 16a**: Modify `compiler/app/Main.hs` to embed inline source maps (base64-encoded)
2. **Phase 16b**: Add `--enable-source-maps` to `local.sh` and `network.sh`

### Dynamic Code (More Complex)
3. **Phase 16c**: Extend `stack2JSON` to include source map in JSON output
4. **Phase 16d**: Modify `deserialize.mts` to merge source maps per namespace
5. **Phase 16e**: Add runtime stack trace translation in `TroupeError.mts`
6. **Phase 16f**: Add `source-map` as runtime dependency

Run `make all && ./bin/golden --quick` after each change.
