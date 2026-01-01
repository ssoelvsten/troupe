# Phase 3: Existing IFC Test Analysis

**Status:** ✓ COMPLETE

**Purpose:** Before flipping NMIFC defaults (Phase 5), we need to ensure existing IFC tests continue to work. Many existing tests use root authority downgrades without proper robustness/transparency conditions. Rather than rewriting all tests, we add explicit `--no-nmifc` options to tests that would fail under NMIFC enforcement.

---

## Analysis Results

### Positive Tests (`tests/rt/pos/ifc/`)

All 17 positive IFC tests with downgrade operations **PASS with NMIFC enabled**:

| Test File                                        | Result   |
|--------------------------------------------------|----------|
| `blockendorseto01.trp`                           | PASS     |
| `blockendorseto02.trp`                           | PASS     |
| `blocking_pini_leaks/blocking-hn-pini.trp`       | PASS     |
| `blocking_pini_leaks/blocking-pini.trp`          | PASS     |
| `decl2.trp`                                      | PASS     |
| `declassify_with_block02.trp`                    | PASS     |
| `declenoughauthority.trp`                        | PASS     |
| `lclear-msc-thesis-example-pos-01.trp`           | PASS     |
| `peek02.trp`                                     | PASS     |
| `pini.trp`                                       | PASS     |
| `pini01.trp`                                     | PASS     |
| `pini02.trp`                                     | PASS     |
| `pini_full_ok.trp`                               | PASS     |
| `rcv.trp`                                        | PASS     |
| `tlev01.trp`                                     | PASS     |
| `tlev04.trp`                                     | PASS     |
| `tuples03.trp`                                   | PASS     |

### Negative Tests (`tests/rt/neg/ifc/`)

Negative tests with downgrade operations continue to fail for their intended reasons (non-NMIFC violations) when NMIFC is enabled. No tests need `--no-nmifc` options.

---

## Conclusion

**No tests require `--no-nmifc` options.** All existing IFC tests are compatible with NMIFC enforcement because:

1. **Symmetric labels in tests**: Existing tests use `#root-integrity` in labels like `<alice;#root-integrity>`, making downgrades satisfy NMIFC robustness/transparency conditions
2. **Proper authority usage**: Tests use root authority which has both confidentiality and integrity components
3. **V1 syntax interpretation**: V1 syntax like `` `{alice}` `` maps to symmetric DC labels `` `<alice;alice>` ``

This means Phase 5 (flipping NMIFC defaults) can proceed without modifying existing tests.

---

## Helper Script

A helper script was created at `tests/_unautomated/claude/check-nmifc-tests.sh` for future use:

```bash
# Run the check script
TROUPE=/path/to/troupe ./tests/_unautomated/claude/check-nmifc-tests.sh
```

The script:
- Scans `tests/rt/pos/ifc/` and `tests/rt/neg/ifc/` directories
- Excludes `nmifc/` subdirectories (already have proper options)
- Tests each file with `--nmifc` flag
- Reports NMIFC robustness/transparency violations

---

## Steps (Original Plan - Not Needed)

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

**Result:** Not needed - all tests pass with NMIFC.

### Step 3.4: Verify all tests pass

Run full test suite to confirm no regressions.

---

## Directories Scanned

- `tests/rt/pos/ifc/` (excluding `nmifc/`)
- `tests/rt/neg/ifc/` (excluding `nmifc/`)
