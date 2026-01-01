# Phase 1: Enable NMIFC via CLI Flag ✓ COMPLETE

**Status:** COMPLETE (as of 2025-12-28)

NMIFC enforcement is fully wired up and can be enabled via `--nmifc` CLI flag.

---

## Steps

### Step 1.1: Add CLI flag for NMIFC mode

**Files modified:**
- [TroupeCliArgs.mts](../../rt/src/TroupeCliArgs.mts)

**Changes:**
1. Added `Nmifc = 'nmifc'` to the `TroupeCliArg` enum
2. Added yargs configuration for the flag (default: `false` for backwards compatibility)

### Step 1.2: Thread NMIFC flag through the runtime

**Implementation approach:**
- [Thread.mts](../../rt/src/Thread.mts) reads `isNmifcMode` from CLI args at module level
- Thread class exposes `isNmifcMode` as a getter
- `runtime.$t` provides access to the flag in downgrade operations

### Step 1.3: Wire NMIFC to value downgrading

**Files modified:**
- [downgrading.mts](../../rt/src/downgrading.mts) - Reads from `runtime.$t.isNmifcMode`
- [declassify.mts](../../rt/src/builtins/declassify.mts) - Uses updated downgrader

### Step 1.4: Wire NMIFC to blocking level downgrading

**Files modified:**
- [Thread.mts](../../rt/src/Thread.mts) - `_validateDowngradeOrThrow()` passes NMIFC flag and PC to validation

---

## Files Modified

| File                          | Change                                              |
|-------------------------------|-----------------------------------------------------|
| `rt/src/TroupeCliArgs.mts`    | Added `--nmifc` flag                               |
| `rt/src/Thread.mts`           | Exposes `isNmifcMode` getter, wires to BL downgrades |
| `rt/src/downgrading.mts`      | Reads NMIFC flag from `runtime.$t.isNmifcMode`     |
| `rt/src/builtins/declassify.mts` | Uses updated downgrader                          |
| `rt/src/DowngradeEnums.mts`   | Added `pcLevel?: Level` to `ValidateDowngradeParams` |
| `rt/src/DowngradeFormatter.mts` | Context-aware error messages                      |
| `scripts/troupe-common.sh`    | Recognizes `--nmifc` and `--no-nmifc` flags        |

---

## Tests Created

**Value downgrade tests:**
- `tests/rt/neg/ifc/nmifc/robust-corrupt-label.trp` - Robustness violation (declassify)
- `tests/rt/neg/ifc/nmifc/transp-corrupt-label.trp` - Transparency violation (endorse)
- `tests/rt/pos/ifc/nmifc/symmetric-label-ok.trp` - Non-corrupt labels pass
- `tests/rt/pos/ifc/nmifc/contrast-corrupt-decl-no-nmifc.trp` - Contrast test for declassify
- `tests/rt/pos/ifc/nmifc/contrast-corrupt-endorse-no-nmifc.trp` - Contrast test for endorse

**Blocking level downgrade tests:**
- `tests/rt/neg/ifc/nmifc/block-robust-corrupt-label.trp` - Robustness violation (blockdeclto)
- `tests/rt/neg/ifc/nmifc/block-transp-corrupt-label.trp` - Transparency violation (blockendorseto)
- `tests/rt/pos/ifc/nmifc/contrast-block-decl-no-nmifc.trp` - Contrast test for blockdeclto
- `tests/rt/pos/ifc/nmifc/contrast-block-endorse-no-nmifc.trp` - Contrast test for blockendorseto
