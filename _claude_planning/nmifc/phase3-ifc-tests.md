# Phase 3: Existing IFC Test Analysis

**Status:** Pending

**Purpose:** Before flipping NMIFC defaults (Phase 5), we need to ensure existing IFC tests continue to work. Many existing tests use root authority downgrades without proper robustness/transparency conditions. Rather than rewriting all tests, we add explicit `--no-nmifc` options to tests that would fail under NMIFC enforcement.

---

## Steps

### Step 3.1: Identify IFC tests without explicit NMIFC options

Scan `tests/rt/pos/ifc/` and `tests/rt/neg/ifc/` directories (excluding `nmifc/` subdirectories) for tests that:
1. Don't have a `.options` file, OR
2. Have a `.options` file but don't specify `--nmifc` or `--no-nmifc`

### Step 3.2: Analyze each test

For each identified test, determine:
1. Does it perform downgrades (declassify, endorse, blockdeclto, blockendorseto, downgrade, etc.)?
2. Would it fail NMIFC checks (robustness/transparency violations)?
3. Is it intentionally testing non-NMIFC behavior?

### Step 3.3: Add `--no-nmifc` options

For tests that would fail or that intentionally test non-NMIFC behavior:
1. Create `.options` file if needed
2. Add `--no-nmifc` flag

### Step 3.4: Verify all tests pass

Run full test suite to confirm no regressions.

**Important:** No `.golden` files must be modified as part of this phase, because they are an important part of the regression maintenance.

---

## Directories to Scan

- `tests/rt/pos/ifc/` (excluding `nmifc/`)
- `tests/rt/neg/ifc/` (excluding `nmifc/`)

---

## Testing Strategy

- Analyze existing IFC tests in the directories above
- Add `--no-nmifc` options to tests that would fail NMIFC checks
- Verify all tests still pass
