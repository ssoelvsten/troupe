# Nullable Code Smells - Systematic Cleanup

## Overview

This document tracks all nullable code smells identified in `/rt/src/` and their remediation status.

**Total Issues Found:** 68 instances across 23 files

| Category | Count | Status |
|----------|-------|--------|
| [Loose Equality Checks](./01-loose-equality.md) | 11 | Pending |
| [Untyped Null Initializations](./02-untyped-nulls.md) | 22 | Pending |
| [Nullish Coalescing Opportunities](./03-nullish-coalescing.md) | 1 | Pending |
| [Dead Code (null after throw)](./04-dead-code.md) | 3 | Pending |
| [Already Compliant](./05-compliant.md) | 31 | N/A |

---

## Priority Order

### Phase 1: Low-Risk Quick Wins
- [ ] Replace loose equality with strict equality (11 instances)
- [ ] Replace ternary null check with `??` (1 instance)
- [ ] Remove dead `return null` after throws (3 instances)

### Phase 2: Type Annotations
- [ ] Add `| null` type annotations to module-level variables
- [ ] Add property type annotations in classes

### Phase 3: Enable strictNullChecks
- [ ] Enable in tsconfig.json
- [ ] Fix all compilation errors

---

## Files by Impact

| File | Issues | Critical |
|------|--------|----------|
| [Lval.mts](../../rt/src/Lval.mts) | 5 | Yes |
| [Thread.mts](../../rt/src/Thread.mts) | 8 | Yes |
| [deserialize.mts](../../rt/src/deserialize.mts) | 7 | Medium |
| [NodeManager.mts](../../rt/src/NodeManager.mts) | 4 | Low |
| [p2p/p2p.mts](../../rt/src/p2p/p2p.mts) | 2 | Low |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-24 | Systematic one-by-one approach | User preference for thorough documentation |
| 2026-01-24 | Phase loose equality first | Lowest risk, highest impact on code clarity |
