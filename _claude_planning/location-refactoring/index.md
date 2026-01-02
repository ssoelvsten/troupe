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
3. **Migration**: Staged with tests passing at each stage

## Stages

| Stage | Description | Document |
|-------|-------------|----------|
| 1 | Infrastructure - add `Located` type | [stage-1-infrastructure.md](stage-1-infrastructure.md) |
| 2 | Core AST migration | [stage-2-core-ast.md](stage-2-core-ast.md) |
| 3 | CPS representation | [stage-3-cps.md](stage-3-cps.md) |
| 4 | IR representation | [stage-4-ir.md](stage-4-ir.md) |
| 5 | Raw/Stack representation | [stage-5-raw-stack.md](stage-5-raw-stack.md) |
| 6 | Code generation | [stage-6-codegen.md](stage-6-codegen.md) |

## Handoff

See [handoff.md](handoff.md) for current progress and next steps.

## Files Modified (by stage)

| Stage | Files |
|-------|-------|
| 1 | `compiler/src/TroupePositionInfo.hs` |
| 2 | `compiler/src/Core.hs`, `compiler/src/DirectWOPats.hs` |
| 3 | `compiler/src/RetCPS.hs`, `compiler/src/RetDFCPS.hs` |
| 4 | `compiler/src/IR.hs`, `compiler/src/ClosureConv.hs` |
| 5 | `compiler/src/Raw.hs`, `compiler/src/IR2Raw.hs`, `compiler/src/Stack.hs`, `compiler/src/Raw2Stack.hs` |
| 6 | `compiler/src/Stack2JS.hs`, `compiler/src/TroupeSourceMap.hs` |
