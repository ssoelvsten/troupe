# Source Maps Implementation Plan

## Goal

Implement V3 source maps so all Troupe runtime errors show source location (`filename.trp:LINE:COL`).

**Key Principle**: Modular development - each phase adds functionality without breaking the compiler.

---

## Current Status (2026-01-03)

**Active proposal**: [status-4.md](status-4.md) - Complete Source Position Solution

### Static Code: IMPLEMENTED (Phase 16a-b)

Inline source maps for static code are now working:
- Compiler embeds base64-encoded source maps in generated JS files (`-m` flag)
- `local.sh` and `network.sh` enable source maps by default
- Node.js `--enable-source-maps` automatically translates stack traces
- Runtime extracts and displays Troupe source locations in error messages

**Example output:**
```
Runtime error in thread abc123@{}%{}
>> value "hi" is not a number
>> at tests/_unautomated/simple-1.trp:1:15
```

### Remaining Work: Dynamic Code (Phase 16c-f)

For deserialized closures (code sent over network), we still need:
1. Extend compiler JSON output with source maps
2. Merge source maps per namespace at runtime
3. Translate stack traces for dynamically constructed functions

See [status-4.md](status-4.md) for the complete proposal.

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
| 16a   | Inline source maps for static code               | **DONE**    | [status-4.md](status-4.md)                                       |
| 16b   | Enable source maps in scripts                    | **DONE**    | [status-4.md](status-4.md)                                       |
| 16c-f | Dynamic code source maps                         | PENDING     | [status-4.md](status-4.md)                                       |

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

### Completed (Phase 16a-b)

Static code source maps are working:
- ✅ **Phase 16a**: `compiler/app/Main.hs` embeds inline source maps (base64-encoded)
- ✅ **Phase 16b**: `local.sh`, `network.sh`, `rt/troupe` use `--enable-source-maps`
- ✅ **Runtime**: `TroupeError.mts` extracts and displays source locations

### Remaining (Phase 16c-f - Dynamic Code)

For deserialized closures, follow [status-4.md](status-4.md):

1. **Phase 16c**: Extend `stack2JSON` to include source map in JSON output
2. **Phase 16d**: Modify `deserialize.mts` to merge source maps per namespace
3. **Phase 16e**: Translate stack traces for dynamic code
4. **Phase 16f**: Add `source-map` as runtime dependency

### Known Issues

- Golden tests with runtime errors need updating (new `>> at file:line:col` line)
- Path cleaning in `TroupeError.mts` only handles `tests/` and `lib/` prefixes

Run `make all && ./bin/golden --quick` after each change.
