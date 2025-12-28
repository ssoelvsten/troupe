# NMIFC Implementation Plan

This document serves as the index for the NMIFC (Non-Malleable Information Flow Control) implementation in Troupe.

## Current Status (as of 2025-12-28)

| Phase | Description                              | Status      |
|-------|------------------------------------------|-------------|
| 1     | [CLI + Wiring](phase1-cli-wiring.md)     | ✓ COMPLETE  |
| 2     | [Cross-Dimensional Primitives](phase2-crossdim.md) | ✓ COMPLETE  |
| 3     | [IFC Test Analysis](phase3-ifc-tests.md) | Pending     |
| 4     | [Standard Library](phase4-stdlib.md)     | Pending     |
| 5     | [Flip Defaults](phase5-defaults.md)      | Pending     |
| 6     | [Root Authority Restriction](phase6-root-authority.md) | Pending (Stretch) |

**Next:** Phase 3 - Analyze existing IFC tests and add `--no-nmifc` options

---

## Implementation Order and Dependencies

```
Phase 1: CLI + Wiring (no breaking changes) ✓ COMPLETE
  └── 1.1 → 1.2 → 1.3, 1.4 (can be parallel)

Phase 2: New Primitives (backwards compatible additions) ✓ COMPLETE
  └── 2.1 → 2.2 (downgrade)
  └── 2.3, 2.4 (blockdownto, blockdown)
  └── 2.5 (mailbox primitives, includes NMIFC wiring)

Phase 3: Existing IFC Test Analysis (backwards compatible)
  └── 3.1 → 3.2 → 3.3 → 3.4

Phase 4: Standard Library (depends on Phase 1, 2)
  └── 4.1 → 4.2 → 4.3

Phase 5: Flip Defaults (after ecosystem adapts)
  └── 5.1 (NMIFC default on)

Phase 6: Root Authority Restriction (breaking, needs migration)
  └── 6.1 → 6.2 → 6.3 → 6.4
```

---

## Overview

### Goals

1. Create cross-dimensional downgrade primitives: `downgrade`, `blockdownto`, `blockdown`
2. Parameterize the system based on NMIFC-enforcing mode
3. (Stretch) Disable downgrading with root authority
4. Keep single-dimensional primitives for backwards compatibility
5. Create standard library for assisted NMIFC downgrading

### Key Concepts

- **Robustness**: `I_from ==> S_from` (integrity implies confidentiality)
- **Transparency**: `I_from ==> I_to \/ S_from`
- **Corrupt labels**: Labels where integrity does NOT imply confidentiality (e.g., `{alice,bob}` = `<alice & bob; alice | bob>`)
- **Symmetric labels**: Non-corrupt labels where integrity equals confidentiality (e.g., `{alice}` = `<alice; alice>`)

### Related Documentation

- [nmifc-summary.md](nmifc-summary.md) - Theoretical background
- [trust-dg.md](trust-dg.md) - Trust anchor pattern

---

## Test Categories

| Category | Description                                        | Phase |
|----------|----------------------------------------------------|-------|
| A        | Robustness violation demonstrations                | 1     |
| B        | Transparency violation demonstrations              | 1     |
| C        | Trust anchor pattern demonstrations                | 4     |
| D        | Cross-dimensional downgrade demonstrations         | 2     |
| E        | Contrast tests (NMIFC vs non-NMIFC)               | 1, 2  |

All NMIFC tests are located in:
- `tests/rt/pos/ifc/nmifc/` - Positive tests (should succeed)
- `tests/rt/neg/ifc/nmifc/` - Negative tests (should fail with NMIFC errors)
