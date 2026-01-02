# Location Refactoring: Migration to `Located` Wrapper Types

## Goal

Reduce maintenance burden by adopting GHC-style `Located` wrapper types, separating position information from AST node content.

## Current State

- Position type `PosInf` embedded directly in every AST constructor
- 17+ pattern matches needed per `GetPosInfo` instance
- Every transformation must manually thread positions
- Inconsistencies: literals partially positioned, `FunDef` has dual positions

## Target State

- `Located a` wrapper type separates position from content
- Pattern synonyms for position-ignoring matches
- Simpler transformations using `fmap` on `Located`
- Single `GetPosInfo (Located a)` instance

## Design Decisions

1. **Granularity**: All sub-terms wrapped with `Located`
2. **Pattern synonyms**: Yes, for convenience
3. **Migration**: Staged front-to-back through pipeline, with adapters at boundaries
4. **Testing**: Each stage independently verifiable with `make all && make test`

## Key Principle: Adapter-Based Migration

Each stage converts one representation to use `Located` while maintaining build stability:

1. Convert the **data types** in one representation to use `Located`
2. Update the **producer** of that representation (parser or previous stage's translation)
3. Add a **temporary adapter** in the consumer (next stage's translation) that extracts positions from `Located` and embeds them in old-style constructors
4. Verify with `make all && make test` - output should be identical
5. Next stage removes the adapter and converts its own representation

This ensures the build never breaks and each stage is independently testable.

## Execution Model

**IMPORTANT**: Each stage must be executed in a fresh Claude Code context. This ensures:
- Clear separation of concerns
- Ability to verify and commit each stage independently
- Clean handoff between sessions

To continue work, start a fresh context and use the prompt in [handoff.md](handoff.md).

## Stages

| Stage | Description                          | Document                                            |
|-------|--------------------------------------|-----------------------------------------------------|
| 1     | Infrastructure - add `Located` type  | [stage-1-infrastructure.md](stage-1-infrastructure.md) |
| 2     | Parser + Direct AST                  | [stage-2-parser-direct.md](stage-2-parser-direct.md)   |
| 3     | DirectWOPats + Core AST              | [stage-3-core.md](stage-3-core.md)                     |
| 4     | CPS representation                   | [stage-4-cps.md](stage-4-cps.md)                       |
| 5     | IR representation                    | [stage-5-ir.md](stage-5-ir.md)                         |
| 6     | Raw + Stack representations          | [stage-6-raw-stack.md](stage-6-raw-stack.md)           |
| 7     | Code generation + source maps        | [stage-7-codegen.md](stage-7-codegen.md)               |
| 8     | Final cleanup                        | [stage-8-cleanup.md](stage-8-cleanup.md)               |

## Pipeline Overview

```
Lexer (L Token)
    ↓
Parser ──────────────→ Direct.Term    [Stage 2: convert to Located]
                           ↓
                      DirectWOPats ───→ Core.Term    [Stage 3: convert to Located]
                                           ↓
                                      RetDFCPS ───→ CPS.KTerm    [Stage 4: convert to Located]
                                                       ↓
                                                  ClosureConv ───→ IR    [Stage 5: convert to Located]
                                                                    ↓
                                                               IR2Raw ───→ Raw    [Stage 6: convert to Located]
                                                                            ↓
                                                                       Raw2Stack ───→ Stack    [Stage 6: convert to Located]
                                                                                        ↓
                                                                                   Stack2JS ───→ JavaScript + Source Maps    [Stage 7]
```

## Files Modified (by stage)

| Stage | Files                                                                           |
|-------|---------------------------------------------------------------------------------|
| 1     | `compiler/src/TroupePositionInfo.hs`                                           |
| 2     | `compiler/src/Direct.hs`, `compiler/src/Parser.y`                              |
| 3     | `compiler/src/Core.hs`, `compiler/src/DirectWOPats.hs`                         |
| 4     | `compiler/src/RetCPS.hs`, `compiler/src/RetDFCPS.hs`                           |
| 5     | `compiler/src/IR.hs`, `compiler/src/ClosureConv.hs`                            |
| 6     | `compiler/src/Raw.hs`, `compiler/src/IR2Raw.hs`, `compiler/src/Stack.hs`, `compiler/src/Raw2Stack.hs` |
| 7     | `compiler/src/Stack2JS.hs`, `compiler/src/TroupeSourceMap.hs`                  |
| 8     | All files (remove adapters, dead code, unused instances)                       |

## Verification Strategy

For each stage:

1. **Build check**: `make all` succeeds (includes compiler, runtime, libraries)
2. **Test suite**: `make test` passes
3. **Output comparison** (recommended):
   ```bash
   # Before changes
   bin/troupec tests/rt/pos/core/simple.trp -o /tmp/before.js

   # After changes
   bin/troupec tests/rt/pos/core/simple.trp -o /tmp/after.js

   # Compare
   diff /tmp/before.js /tmp/after.js
   ```

## Handoff

See [handoff.md](handoff.md) for current progress and instructions for continuing in a fresh context.
