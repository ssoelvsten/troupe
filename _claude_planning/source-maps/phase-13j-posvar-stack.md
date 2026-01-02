# Phase 13j: Documentation and Summary

## Goal

Document the completed operand position threading and prepare for the next phases (runtime resolver, error positions).

## Summary of Changes

### Phase 13 Accomplishments

| Phase | What Was Done                                                    |
|-------|------------------------------------------------------------------|
| 13a   | Added `PosVar`, `PosField` types to RetCPS.hs (infrastructure)   |
| 13b   | Prepared RetDFCPS.hs with helper functions                       |
| 13c   | Added `PosInf` operand position fields to Raw.RawExpr            |
| 13d   | Updated Stack2JS.hs to emit markers for operand positions        |
| 13e   | Added `PosInf` operand position fields to IR.IRExpr              |
| 13f   | Captured statement positions as operand positions in ClosureConv |
| 13g   | Added `PosInf` operand position fields to CPS SimpleTerm         |
| 13h   | Captured actual operand positions in RetDFCPS                    |
| 13i   | Cleanup and verification                                         |

### Position Flow

```
Parser (Direct.hs)
    ↓ Direct.Term has PosInf on constructs

CaseElimination (DirectWOPats.hs)
    ↓ DirectWOPats.Term preserves positions

Core lowering (Core.hs)
    ↓ Core.Term preserves positions

CPS transform (RetDFCPS.hs)
    ↓ Captures operand positions from Core.Term
    ↓ Stores in SimpleTerm's PosInf operand position fields

CPS optimization (CPSOpt.hs)
    ↓ Preserves operand positions through transforms

Closure conversion (ClosureConv.hs)
    ↓ Transfers positions to IR.IRExpr

IR optimization (IROpt.hs)
    ↓ Preserves operand positions

IR to Raw (IR2Raw.hs)
    ↓ Transfers positions to Raw.RawExpr

Raw optimization (RawOpt.hs)
    ↓ Preserves operand positions

Raw to Stack (Raw2Stack.hs)
    ↓ Transfers positions to Stack

Stack to JS (Stack2JS.hs)
    ↓ Emits source map markers for operand positions

Source Map generation
    ↓ Collects markers, generates VLQ mappings

Output: .js.map file with operand-level mappings
```

### Types Modified

| Layer | Type                   | Fields Added                    |
|-------|------------------------|---------------------------------|
| CPS   | `SimpleTerm.Bin`       | `PosInf`, `PosInf` (op1, op2)   |
| CPS   | `SimpleTerm.Un`        | `PosInf` (operand)              |
| CPS   | `SimpleTerm.ProjField` | `PosInf`, `PosInf` (rec, field) |
| CPS   | `SimpleTerm.ProjIdx`   | `PosInf` (tuple)                |
| IR    | `IRExpr.Bin`           | `PosInf`, `PosInf` (op1, op2)   |
| IR    | `IRExpr.Un`            | `PosInf` (operand)              |
| IR    | `IRExpr.ProjField`     | `PosInf`, `PosInf` (rec, field) |
| IR    | `IRExpr.ProjIdx`       | `PosInf` (tuple)                |
| Raw   | `RawExpr.Bin`          | `PosInf`, `PosInf` (op1, op2)   |
| Raw   | `RawExpr.Un`           | `PosInf` (operand)              |
| Raw   | `RawExpr.ProjField`    | `PosInf`, `PosInf` (rec, field) |
| Raw   | `RawExpr.ProjIdx`      | `PosInf` (tuple)                |

### Files Modified (Summary)

| File             | Changes                                        |
|------------------|------------------------------------------------|
| `RetCPS.hs`      | Added PosVar/PosField types, updated SimpleTerm|
| `RetDFCPS.hs`    | Capture operand positions from Core terms      |
| `CPSOpt.hs`      | Updated pattern matches, preserve positions    |
| `RetRewrite.hs`  | Updated pattern matches                        |
| `RetFreeVars.hs` | Updated pattern matches                        |
| `ClosureConv.hs` | Transfer positions to IR                       |
| `IR.hs`          | Added PosInf fields to IRExpr                  |
| `IROpt.hs`       | Updated pattern matches, preserve positions    |
| `IR2Raw.hs`      | Transfer positions to Raw                      |
| `Raw.hs`         | Added PosInf fields to RawExpr                 |
| `RawOpt.hs`      | Updated pattern matches, preserve positions    |
| `Raw2Stack.hs`   | Updated pattern matches                        |
| `RawDefUse.hs`   | Updated pattern matches                        |
| `Stack2JS.hs`    | Emit markers for operand positions             |

## Verification

### Source Map Quality

After Phase 13, source maps include:
- Statement-level mappings (from Phase 12)
- Operand-level mappings (from Phase 13)

For `x + y`:
- Mapping for `x` (left operand)
- Mapping for `y` (right operand)
- Mapping for the whole expression

### Test Command

```bash
bin/troupec --source-map tests/rt/pos/core/fib10.trp -o /tmp/fib10.js
npx ts-node rt/src/tools/inspect-sourcemap.ts /tmp/fib10.js.map --one-based
```

## Next Phases

### Phase 14: Runtime Source Map Resolver

The runtime needs to:
1. Load source maps at startup
2. Resolve JS line/column to source file:line:column
3. Integrate with error reporting

### Phase 15: Error Message Positions

Update runtime error messages to:
1. Include source file:line:column
2. Use the source map resolver
3. Show readable error locations

## Phase 13 Complete

All operand positions now flow through the compiler pipeline and are emitted in source maps.
