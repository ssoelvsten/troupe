# Autonomous Tasks Index

This directory contains self-contained task specifications for autonomous execution.
Each task file includes all necessary context for execution in a fresh conversation.

## Active Tasks

| Priority | Task File                                                                      | Effort  | Status | Source      |
|----------|--------------------------------------------------------------------------------|---------|--------|-------------|
| 1        | [assertion-refactor.md](./deferred/assertion-refactor.md)                               | 1 file  | Deferred | GitHub #67  |
| 2        | [dc-label-shorthands-parser-support.md](./dc-label-shorthands-parser-support.md) | 3 files | Ready  | V1/V2 work  |

## Completed Tasks (moved to `../completed_planning/`)

- remove-lubs.md
- dclaborconst-custom-type.md
- floating-point-constants.md
- underscore-in-floats.md
- v1-pretty-printing.md
- cli-arguments-access.md

## Sources

- `.experiments/whats-next.md` - Internal planning notes
- GitHub Issues: https://github.com/TroupeLang/Troupe/issues

## Execution Instructions

1. Each task file is self-contained with all context needed
2. After completing a task, run `make rt` (for runtime) or `make stack` (for compiler)
3. Run `make test` to verify no regressions
4. Mark task as completed in this index

## Tasks NOT Recommended for Autonomous Work

These require design decisions, domain expertise, or external dependencies:

| Issue | Reason |
|-------|--------|
| #66 Nomadic modules | Major architectural change |
| #52 Syntactic variants | Complex cross-codebase changes |
| #65 Integrity mismatch | Semantic investigation required |
| #121 Unit equality | Design decision needed |
| #117 Exit protocol | Requirements unclear |
| skipLibCheck | Blocked by libp2p dependency upgrades |
