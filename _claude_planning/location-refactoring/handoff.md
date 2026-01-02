# Location Refactoring: Handoff Document

## Current Phase

**STAGE: 3 - NOT STARTED**

## How to Continue

Each stage must be executed in a **fresh Claude Code context**. Use this prompt to continue:

```
Continue the Location Refactoring migration for Troupe.

Read `_claude_planning/location-refactoring/handoff.md` for current status.
Read `_claude_planning/location-refactoring/index.md` for overview.

Execute the next pending stage according to its stage document.
After completing the stage:
1. Run `make all && make test` to verify
2. Commit with the specified message
3. Update handoff.md with the new status
```

## Progress Tracker

| Stage | Description                     | Status      | Commit  |
|-------|---------------------------------|-------------|---------|
| 1     | Infrastructure                  | Complete    | a8341b7 |
| 2     | Parser + Direct                 | Complete    | 9a95cb5 |
| 3     | DirectWOPats + Core             | Not started | -       |
| 4     | CPS                             | Not started | -       |
| 5     | IR                              | Not started | -       |
| 6     | Raw + Stack                     | Not started | -       |
| 7     | Code generation + source maps   | Not started | -       |
| 8     | Cleanup                         | Not started | -       |

## Next Action

**Execute Stage 3**: Read [stage-3-core.md](stage-3-core.md) and implement in a fresh context.

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
3. **Verify before commit**: Always run `make all && make test` before committing
4. **One representation at a time**: Migrate the data types AND the producer in each stage

## Stage Completion Checklist

When completing a stage:

1. [ ] Read the stage document thoroughly
2. [ ] Implement all changes described
3. [ ] Run `make all && make test` - all tests must pass
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
