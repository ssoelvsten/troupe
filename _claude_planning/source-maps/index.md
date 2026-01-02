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
| 13a   | Add PosVar/PosField types (infrastructure)       | **NEXT** | [phase-13a-posvar-retcps.md](phase-13a-posvar-retcps.md)         |
| 13b   | Prepare RetDFCPS                                 | Pending  | [phase-13b-posvar-retdfcps.md](phase-13b-posvar-retdfcps.md)     |
| 13c   | Add optional positions to Raw                    | Pending  | [phase-13c-posvar-cpsopt.md](phase-13c-posvar-cpsopt.md)         |
| 13d   | Emit operand markers in Stack2JS                 | Pending  | [phase-13d-posvar-cps-utils.md](phase-13d-posvar-cps-utils.md)   |
| 13e   | Add optional positions to IR                     | Pending  | [phase-13e-posvar-closureconv.md](phase-13e-posvar-closureconv.md) |
| 13f   | Capture statement positions as operand positions | Pending  | [phase-13f-posvar-ir.md](phase-13f-posvar-ir.md)                 |
| 13g   | Add optional positions to CPS SimpleTerm         | Pending  | [phase-13g-posvar-ir2raw.md](phase-13g-posvar-ir2raw.md)         |
| 13h   | Capture actual operand positions in RetDFCPS     | Pending  | [phase-13h-posvar-raw.md](phase-13h-posvar-raw.md)               |
| 13i   | Cleanup and verification                         | Pending  | [phase-13i-posvar-raw-utils.md](phase-13i-posvar-raw-utils.md)   |
| 13j   | Documentation and summary                        | Pending  | [phase-13j-posvar-stack.md](phase-13j-posvar-stack.md)           |
| 14    | Runtime source map resolver                      | Pending  | [phase-14-runtime-resolver.md](phase-14-runtime-resolver.md)     |
| 15    | Error message positions                          | Pending  | [phase-15-position-params.md](phase-15-position-params.md)       |

---

## Phase 13: Revised Approach (Non-Breaking)

### Problem with Original Plan

The original phases 13a-13j proposed changing type definitions (e.g., `SimpleTerm` from `VarName` to `PosVar`) which would immediately break all modules that pattern-match on those types.

### Solution: Additive Position Fields

Instead of breaking changes, we:
1. Add **new** `PosInf` position fields to types
2. Work **backwards** from Stack2JS to CPS
3. Default to `NoPos`, so existing code continues to work
4. Gradually enable position capture

Note: We use plain `PosInf` (not `Maybe PosInf`) since `PosInf` already has a `NoPos` constructor.

### Revised Phase Structure

| Phase | Description                                          | Key Files                            | Breaks? |
|-------|------------------------------------------------------|--------------------------------------|---------|
| 13a   | Add PosVar/PosField helper types (infrastructure)    | RetCPS.hs                            | No      |
| 13b   | Prepare RetDFCPS with posOrFallback helper           | RetDFCPS.hs                          | No      |
| 13c   | Add operand `PosInf` fields to Raw.RawExpr           | Raw.hs, IR2Raw.hs, RawOpt.hs, etc.   | No      |
| 13d   | Emit markers for operand positions in Stack2JS       | Stack2JS.hs                          | No      |
| 13e   | Add operand `PosInf` fields to IR.IRExpr             | IR.hs, IROpt.hs, ClosureConv.hs      | No      |
| 13f   | Capture statement positions as operand positions     | ClosureConv.hs                       | No      |
| 13g   | Add operand `PosInf` fields to CPS SimpleTerm        | RetCPS.hs, CPSOpt.hs, etc.           | No      |
| 13h   | Capture actual operand positions from Core           | RetDFCPS.hs                          | No      |
| 13i   | Cleanup and verification                             | Various                              | No      |
| 13j   | Documentation                                        | -                                    | No      |

**Each phase**: `make all && ./bin/golden --quick` passes.

See [phase-13-revised-approach.md](phase-13-revised-approach.md) for the full design rationale.

---

## Position Threading Gap Analysis

| Layer       | File            | Has PosInf         | Operand Positions |
|-------------|-----------------|--------------------|-------------------|
| Parser AST  | Direct.hs       | **All constructs** | In Phase 10       |
| Pattern-free| DirectWOPats.hs | **All constructs** | Via CaseElim      |
| Core        | Core.hs         | **All constructs** | Via lower         |
| CPS         | RetCPS.hs       | **All constructs** | Phase 13g adds    |
| IR          | IR.hs           | **All constructs** | Phase 13e adds    |
| Raw         | Raw.hs          | **All constructs** | Phase 13c adds    |
| Stack       | Stack.hs        | **All constructs** | Via Raw           |

---

## Phase Dependencies

```
Phase 12 (Emit real source maps)
    |
Phase 13a-b (Infrastructure - helper types)
    |
Phase 13c-d (Raw layer + Stack2JS emission)
    |
Phase 13e (IR layer)
    |
Phase 13f (ClosureConv capture)
    |
Phase 13g-h (CPS layer + RetDFCPS capture)
    |
Phase 13i-j (Cleanup + documentation)
    |
Phase 14 (Runtime resolver)
    |
Phase 15 (Error message positions)
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
