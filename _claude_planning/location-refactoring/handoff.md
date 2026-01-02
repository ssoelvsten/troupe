# Location Refactoring: Handoff Document

## Current Phase

**STAGE: 0 - NOT STARTED**

## Progress Tracker

| Stage | Status | Commit |
|-------|--------|--------|
| 1. Infrastructure | Not started | - |
| 2. Core AST | Not started | - |
| 3. CPS | Not started | - |
| 4. IR | Not started | - |
| 5. Raw/Stack | Not started | - |
| 6. Codegen | Not started | - |

## Next Action

Start Stage 1: Read [stage-1-infrastructure.md](stage-1-infrastructure.md) and implement.

## Context for Fresh Session

To continue this work in a fresh context, use:

> Continue the Location Refactoring migration. Read `_claude_planning/location-refactoring/handoff.md` for current status and `_claude_planning/location-refactoring/index.md` for overview. Execute the next pending stage.

## Stage Completion Checklist

When completing a stage:

1. Implement changes per stage document
2. Run `make compiler && make test`
3. Commit with specified message
4. Update this handoff document:
   - Change stage status to "Complete"
   - Add commit hash
   - Update "Current Phase" section
   - Update "Next Action" section

## Risks and Notes

- **FunDef dual positions** (Stage 4): Currently has two `PosInf` fields. Consolidation decision needed during implementation.
- **IR2Raw reader monad** (Stage 5): Currently uses reader monad for position context. May need refactoring.
- **Source maps** (Stage 6): Must verify source maps still work after all changes.

## Reference

- Main plan: [index.md](index.md)
- Original planning file: `/Users/aslan/.claude/plans/fancy-bouncing-flute.md`
