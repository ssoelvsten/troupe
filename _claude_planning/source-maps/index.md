# Source Maps Implementation Plan

## Goal

Implement V3 source maps so all Troupe runtime errors show source location (`filename.trp:LINE:COL`).

**Key Principle**: Modular development - each phase adds functionality without breaking the compiler.

---

## Current Status (2026-01-04)

**Active proposal**: [status-6.md](status-6.md) - Unified Source Position Solution (Phase 17)

Phase 16a-c provided initial source map support, but Phase 16d-f has been **dropped** in favor of Phase 17's unified approach.

### Phase 17: Unified Approach

[status-6.md](status-6.md) proposes a **single mechanism** for both static and dynamic code:

1. **Track `currentSourceMap` on Thread** - Runtime knows which source map to use
2. **Function/continuation preambles** - Set source map on entry (`$t.currentSourceMap = this.__sourceMap`)
3. **Source maps attached to namespaces** - GC-friendly, no memory leaks
4. **Runtime stack translation** - Self-contained, no dependency on Node.js `--enable-source-maps`

This approach works identically for static and dynamic code, replacing the split design of Phase 16.

### Previous Proposals (Superseded)

- [status-5.md](status-5.md) - GC-friendly design (superseded by status-6)
- [status-4.md](status-4.md) - Original Phase 16 proposal (superseded by status-5)

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
| 16a   | Inline source maps for static code               | DONE        | [status-4.md](status-4.md)                                       |
| 16b   | Enable source maps in scripts                    | DONE        | [status-4.md](status-4.md)                                       |
| 16c   | lastCallSourcePos for runtime errors             | DONE        | [status-4.md](status-4.md)                                       |
| 16d-f | Dynamic code source maps (Node.js approach)      | DROPPED     | Superseded by Phase 17                                           |
| 17a-f | Unified source map tracking                      | **PENDING** | [status-6.md](status-6.md)                                       |

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

### Phase 16a-b: Static Code Source Maps - COMPLETE (2026-01-03)

**All tests pass (397/397)** - Note: Some golden files need updating for new error format.

**Files modified**:
- `compiler/app/Main.hs` - Embed inline base64 source maps instead of separate `.map` files
- `local.sh` - Add `-m` to compiler, `--enable-source-maps` to node
- `network.sh` - Add `-m` to compiler
- `rt/troupe` - Add `--enable-source-maps` to node
- `rt/src/TroupeError.mts` - Extract source location from stack trace and display
- `rt/src/tools/inspect-sourcemap.ts` - Support embedded inline source maps

**Key implementation details**:
- Source maps are base64-encoded and appended as `//# sourceMappingURL=data:...` comment
- Node.js `--enable-source-maps` translates the string stack trace (but NOT CallSite API)
- Path cleaning extracts relative paths (e.g., `/tmp/tests/foo.trp` → `tests/foo.trp`)
- Error format: existing lines unchanged, source location added as `>> at file:line:col`

---

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

### Next: Phase 17 - Unified Source Map Tracking

Follow [status-6.md](status-6.md) for the unified approach:

1. **Phase 17a**: Add `currentSourceMap` field to Thread, add `SourceMapResolver.mts`
2. **Phase 17b**: Integrate source map translation into error handling
3. **Phase 17c**: Compiler generates preambles + attaches source map to Top
4. **Phase 17d**: Extend `JSOutput` with `sourceMap` for `--json-ir` mode
5. **Phase 17e**: Runtime merges source maps for dynamic code
6. **Phase 17f**: Polish and comprehensive testing

### Completed (Phase 16a-c)

- ✅ **Phase 16a**: Compiler embeds inline source maps (base64-encoded)
- ✅ **Phase 16b**: Scripts use `--enable-source-maps`
- ✅ **Phase 16c**: `lastCallSourcePos` tracking for call-site positions

### Dropped (Phase 16d-f)

The Node.js-based approach for dynamic code has been replaced by Phase 17's unified runtime-based approach.

### Known Issues

- Golden tests with runtime errors may need updating for new error format
- Path cleaning in `TroupeError.mts` only handles `tests/` and `lib/` prefixes

Run `make all && ./bin/golden --quick` after each change.
