# Phase 2: Cross-Dimensional Downgrade Primitives ✓ COMPLETE

**Status:** COMPLETE (as of 2025-12-28)

Cross-dimensional downgrade primitives implemented, allowing both confidentiality and integrity to change atomically.

---

## Background

Troupe previously had separate primitives for single-dimension downgrades:
- `declassify(value, authority, targetLabel)` - changes confidentiality only
- `endorse(value, authority, targetLabel)` - changes integrity only
- `blockdeclto(authority, targetLevel)` - declassifies blocking level
- `blockendorseto(authority, targetLevel)` - endorses blocking level

Phase 2 adds cross-dimensional primitives that change both dimensions atomically.

---

## New Primitives

| Primitive                            | Description                                    |
|--------------------------------------|------------------------------------------------|
| `downgrade(value, authority, target)` | Cross-dimensional value downgrade             |
| `blockdownto(authority, target)`     | Cross-dimensional blocking level downgrade    |
| `blockdown(authority)`               | Downgrade blocking level to current PC        |

**Mailbox clearance:**
- `lowermbox` now uses cross-dimensional semantics (`DowngradeDimension.BOTH`)

---

## Implementation

### Step 2.1: Add `downgrade` primitive (compiler)

**File:** [IR.hs](../../compiler/src/IR.hs) - Added `"downgrade"` to built-in list

### Step 2.2: Implement `downgrade` primitive (runtime)

Extended `downgrader()` to support `DowngradeDimension.BOTH`:

| File                                | Change                                          |
|-------------------------------------|-------------------------------------------------|
| `rt/src/DowngradeEnums.mts`         | Added `BOTH = 3` to `DowngradeDimension` enum  |
| `rt/src/levels/DCLabels/dclabel.mts` | `okToDowngradeGeneric` handles `BOTH`          |
| `rt/src/Level.mts`                  | Added `okToCrossDimensionalDowngrade` export   |
| `rt/src/downgrading.mts`            | Added `BOTH` case                              |
| `rt/src/builtins/declassify.mts`    | Added `downgrade` primitive                    |

### Step 2.3: Add `blockdownto` primitive

| File                        | Change                                    |
|-----------------------------|-------------------------------------------|
| `compiler/src/IR.hs`        | Added `"blockdownto"` to built-in list   |
| `rt/src/Thread.mts`         | Added `blockDowngradeTo()` method        |
| `rt/src/builtins/pini.mts`  | Added `blockdownto` primitive            |

### Step 2.4: Add `blockdown` primitive

| File                        | Change                                    |
|-----------------------------|-------------------------------------------|
| `compiler/src/IR.hs`        | Added `"blockdown"` to built-in list     |
| `rt/src/builtins/pini.mts`  | Added `blockdown` primitive              |

### Step 2.5: Mailbox clearance downgrading

**File:** [Thread.mts](../../rt/src/Thread.mts) - Changed `lowerMboxClearance()` to use `DowngradeDimension.BOTH`

---

## Tests Created

**Category D (cross-dimensional primitives with NMIFC):**
- `tests/rt/pos/ifc/nmifc/crossdim-downgrade-symmetric-ok.trp`
- `tests/rt/pos/ifc/nmifc/crossdim-blockdownto-symmetric-ok.trp`
- `tests/rt/pos/ifc/nmifc/crossdim-blockdown-symmetric-ok.trp`
- `tests/rt/neg/ifc/nmifc/crossdim-downgrade-corrupt-label.trp`
- `tests/rt/neg/ifc/nmifc/crossdim-blockdownto-corrupt-label.trp`

**Category E (contrast tests without NMIFC):**
- `tests/rt/pos/ifc/nmifc/contrast-crossdim-downgrade-no-nmifc.trp`
- `tests/rt/pos/ifc/nmifc/contrast-crossdim-blockdownto-no-nmifc.trp`
