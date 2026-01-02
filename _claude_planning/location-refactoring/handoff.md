# Location Refactoring: Handoff Document

## Current Phase

**STAGE: 7 - COMPLETE**

## How to Continue

Each stage must be executed in a **fresh Claude Code context**. Use this prompt to continue:

```
Continue the Location Refactoring migration for Troupe.

Read `_claude_planning/location-refactoring/handoff.md` for current status.
Read `_claude_planning/location-refactoring/index.md` for overview.

Execute the next pending stage according to its stage document.
After completing the stage:
1. Run `make all && ./bin/golden --quick` to verify
2. Commit with the specified message
3. Update handoff.md with the new status
```

## Progress Tracker

| Stage | Description                     | Status      | Commit  |
|-------|---------------------------------|-------------|---------|
| 1     | Infrastructure                  | Complete    | a8341b7 |
| 2     | Parser + Direct                 | Complete    | 9a95cb5 |
| 3     | DirectWOPats + Core             | Complete    | b327d9a |
| 4     | CPS                             | Complete    | d787a72 |
| 5     | IR                              | Complete    | f7b6511 |
| 6     | Raw + Stack                     | Complete    | 7e7574e |
| 7     | Code generation + source maps   | Complete    | (merged with Stage 6) |
| 8     | Cleanup                         | Not started | -       |

## Next Action

**Execute Stage 8**: Read [stage-8-cleanup.md](stage-8-cleanup.md) and implement in a fresh context.

## Stage 1 Implementation Notes

- Constructor renamed from `L` to `Loc` to avoid conflict with `Lexer.L` (which wraps tokens)
- All stage documents have been updated to use `Loc` instead of `L`
- Fixed pre-existing bugs in `ir2raw-test` test files (wrong `FunDef` arity)

## Stage 2 Implementation Notes

- Added type aliases `LTerm`, `LDecl`, `LDeclPattern`, `LFunDecl`, `LFields` to Direct.hs
- Updated all Term constructors to use Located wrappers for sub-terms
- Parser.y: Added `atPos` helper to create Located values from token positions
- Updated all grammar rules to produce Located terms and patterns
- CaseElimination.hs: Added `transLTerm` adapter function that extracts position from Located wrapper and embeds it in DirectWOPats terms (maintains backward compatibility)
- Updated Exports.hs, AtomFolding.hs, AddAmbientMethods.hs to work with new Located types
- Golden tests for pattern match errors updated: positions now point to the actual pattern location (more accurate) rather than the `val` keyword
- Literal patterns in Parser now get proper positions (NUM, FLOAT, STRING, true, false, LABEL, DCLabel)

## Stage 3 Implementation Notes

- Added type aliases `LTerm`, `LDecl`, `LFields` to Core.hs
- Updated all Term constructors to remove embedded PosInf - positions now in Located wrapper
- Lambda type updated: `Unary VarName PosInf LTerm` (keeps argument position separate)
- FunDecl keeps embedded PosInf for function definition position
- Updated `lower` function to produce `LTerm` instead of `Term`
- Updated `rename` function with new `renameTerm` helper to work with Located terms
- RetDFCPS.hs: Added adapter pattern - `trans` and `transExplicit` now take `Core.LTerm` and extract position from `Loc` wrapper to embed in old-style CPS constructors
- Note: `TypeSynonymInstances` and `FlexibleInstances` pragmas added to Core.hs for Show instance
- GetPosInfo instance for LTerm comes from TroupePositionInfo's generic `GetPosInfo (Located a)` instance

## Stage 4 Implementation Notes

- Added type aliases `LKTerm = Located KTerm`, `LSimpleTerm = Located SimpleTerm` to RetCPS.hs
- Removed embedded PosInf from most KTerm and SimpleTerm constructors - positions now in Located wrapper
- **Exception**: `Error VarName PosInf` and `AssertElseError VarName LKTerm VarName PosInf` keep embedded PosInf because these represent the error source location, not the expression position
- KLambda: `Unary VarName PosInf LKTerm` (keeps argument position separate, body is Located)
- FunDef: `Fun VarName KLambda` - position is on the Located wrapper when used
- ContDef: `Cont VarName LKTerm` - updated to use Located body
- Added `Ord` instance for `Located` in TroupePositionInfo.hs (needed for CSE map in CPSOpt)
- RetDFCPS.hs: Removed Stage 3 adapter, now produces proper `Located CPS.KTerm` values
- ClosureConv.hs: Added adapter pattern - `cpsToIR` takes `CPS.LKTerm` and extracts positions from `Loc` wrapper to embed in old-style IR constructors
- Updated CPSOpt.hs: `Simplifiable` instance for LKTerm, all pattern matches updated for Located terms
- Updated RetFreeVars.hs: `FreeNames` instances updated for Located terms
- Updated RetRewrite.hs: All pattern matches and reconstructions updated for Located terms

## Stage 5 Implementation Notes

- Added type aliases `LIRInst`, `LIRTerminator`, `LFunDef`, `LIRExpr` to IR.hs
- Updated `IRBBTree` to use `[LIRInst]` and `LIRTerminator`
- Updated `IRProgram` to use `[LFunDef]`
- Removed embedded PosInf from most `IRInst` and `IRTerminator` constructors - positions now in Located wrapper
- **Exception**: `Error VarAccess PosInf` and `AssertElseError VarAccess IRBBTree VarAccess PosInf` keep embedded PosInf for error source location
- Consolidated `FunDef` from two positions to one: function definition position is now on the Located wrapper (`LFunDef`), argument position remains inline
- ClosureConv.hs: Removed Stage 4 adapter, now produces proper Located IR values
- IR2Raw.hs: Added adapter pattern - `inst2raw`, `tr2raw`, and `fun2raw` now extract positions from `Loc` wrapper and embed in old-style Raw constructors
- IROpt.hs: Updated `Substitutable` instances for Located types, updated `insPeval`, `trPeval`, `funopt` to work with Located types
- Added `ComputesDependencies` and `WellFormedIRCheck` instances for `Located a`

## Stage 6 Implementation Notes

- Added type aliases `LRawInst`, `LRawTerminator`, `LFunDef` to Raw.hs
- Added type aliases `LStackInst`, `LStackTerminator`, `LFunDef` to Stack.hs
- Removed embedded PosInf from all `RawInst`, `RawTerminator`, `StackInst`, `StackTerminator` constructors - positions now in Located wrapper
- Updated `RawBBTree = BB [LRawInst] LRawTerminator` to use Located types
- Updated `StackBBTree = BB [LStackInst] LStackTerminator` to use Located types
- Updated `RawProgram` and `StackProgram` to use `[LFunDef]`
- IR2Raw.hs: Fixed `intercept` function type signature to return `[LRawInst]`
- RawOpt.hs: Added `FlexibleInstances` and `TypeSynonymInstances` pragmas for Located type instances
- RawDefUse.hs: Updated `Usable`, `Definable`, `Trav` instances to work with Located types
- Raw2Stack.hs: Updated `trInsts`, `trTr`, `trBB`, `trFun` to produce Located Stack types from Located Raw types
- Stack2JS.hs: Added adapter instances for `LFunDef`, `LStackInst`, `LStackTerminator`
- Stack2JS.hs: Created `toJSFunDefWithPos`, `ir2jsWithPos`, `tr2jsWithPos` functions that take position as explicit argument
- Stack2JS.hs: `LabelGroup` now contains `[LStackInst]` (Located instructions), updated `ppLevelOp` accordingly
- **Note**: Stage 7 (Code generation + source maps) is effectively complete since Stack2JS was updated as part of this stage

## Stage 7 Implementation Notes

- Stage 7 was effectively completed as part of Stage 6
- Stack2JS.hs already has `ToJS` instances for `LFunDef`, `LStackInst`, `LStackTerminator` that extract positions via pattern matching on `Loc pos inst`
- `toJSFunDefWithPos`, `ir2jsWithPos`, `tr2jsWithPos` functions take explicit position arguments
- `emitMarker` function generates source map markers in the output
- `stack2JSWithMappings` generates JS code with source map mappings
- TroupeSourceMap.hs `collectMapping` works with `PosInf` directly (callers use `getLoc`)
- Source map generation verified working: produces valid JSON with correct source references and VLQ-encoded mappings
- All 397 golden tests pass

## Stage Documents

- [Stage 1: Infrastructure](stage-1-infrastructure.md) - Add `Located` type
- [Stage 2: Parser + Direct](stage-2-parser-direct.md) - Migrate parser and Direct AST
- [Stage 3: Core](stage-3-core.md) - Migrate Core AST
- [Stage 4: CPS](stage-4-cps.md) - Migrate CPS representation
- [Stage 5: IR](stage-5-ir.md) - Migrate IR representation
- [Stage 6: Raw + Stack](stage-6-raw-stack.md) - Migrate Raw and Stack
- [Stage 7: Codegen](stage-7-codegen.md) - Finalize code generation
- [Stage 8: Cleanup](stage-8-cleanup.md) - Remove dead code

## Key Principles

1. **Fresh context per stage**: Start a new Claude Code session for each stage
2. **Adapter-based migration**: Each stage adds a temporary adapter at the boundary to the next representation
3. **Verify before commit**: Always run `make all && ./bin/golden --quick` before committing
4. **One representation at a time**: Migrate the data types AND the producer in each stage

## Stage Completion Checklist

When completing a stage:

1. [ ] Read the stage document thoroughly
2. [ ] Implement all changes described
3. [ ] Run `make all && ./bin/golden --quick` - all tests must pass
4. [ ] Commit with the specified message format
5. [ ] Update this handoff document:
   - Change stage status to "Complete"
   - Add commit hash
   - Update "Current Phase" section
   - Update "Next Action" section

## Risks and Notes

- **Stage 2 (Parser)**: Many grammar rules to update - be methodical
- **Stage 3 (Core)**: Pattern synonyms are optional but recommended for readability
- **Stage 5 (IR)**: FunDef has dual positions - consolidate carefully
- **Stage 6 (Raw)**: IR2Raw uses reader monad - can simplify or keep
- **Stage 7 (Codegen)**: Must verify source maps work correctly

## Reference

- Main plan: [index.md](index.md)
- Build commands: `make all`, `make test`, `make compiler`
- Test a single file: `./local.sh tests/rt/pos/core/simple.trp`
