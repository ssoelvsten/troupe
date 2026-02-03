# Phase 5: Flip Defaults

**Status:** ✓ COMPLETE

**Purpose:** After Phases 1-4 are stable and the ecosystem has had time to adapt, make NMIFC enforcement the default.

---

## Steps

### Step 5.1: Make NMIFC enforcement the default

**Changes:**
1. Change `--nmifc` default from `false` to `true`
2. Add `--no-nmifc` or `--disable-nmifc` flag for opting out
3. Update documentation to reflect new defaults

**Files to modify:**
- [TroupeCliArgs.mts](../../rt/src/TroupeCliArgs.mts)

---

## Prerequisites

- Phase 1: CLI + Wiring ✓ COMPLETE
- Phase 2: Cross-Dimensional Primitives ✓ COMPLETE
- Phase 3: IFC Test Analysis (must complete before flipping)
- Phase 4: Standard Library (recommended before flipping)

---

## Migration Guide

When this phase is activated:
1. Existing programs that rely on non-NMIFC behavior will need `--no-nmifc`
2. Programs using corrupt labels for downgrades will fail
3. Programs should migrate to using symmetric labels or the trust anchor pattern
