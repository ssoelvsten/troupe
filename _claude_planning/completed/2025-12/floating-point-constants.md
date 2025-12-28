# Task: Support Floating Point Constants

## Status: COMPLETE

**Commit:** `3a7384e` on branch `improvements-floats-in-the-frontend`
**Date:** 2025-12-27

## Source
GitHub Issue #90: https://github.com/TroupeLang/Troupe/issues/90
Labels: `student programmer`, `compiler (Front-end)`

> "Troupe uses Javascript `double`s and has multiple operations that create floating point values, but the compiler currently rejects floating point constants."

---

## Implementation Summary

### Features Added

- Basic float literals: `3.14`, `0.5`, `123.456`
- Scientific notation: `1.5e10`, `3.14E-2`, `1e+5`
- Underscore separators in floats: `1_000.5`, `3.141_592` (also closes #89)
- Cross-type numeric equality: `3 = 3.0` evaluates to `true`

### Design Decision: `Numeric` Wrapper Type

Instead of adding a separate `LFloat` constructor, we introduced a unified `Numeric` wrapper:

```haskell
data Numeric = NumInt Integer | NumFloat Double
  deriving (Show, Generic)

instance Eq Numeric where
  (NumInt x) == (NumInt y) = x == y
  (NumFloat x) == (NumFloat y) = x == y
  (NumInt x) == (NumFloat y) = fromInteger x == y
  (NumFloat x) == (NumInt y) = x == fromInteger y

data Lit = LNumeric Numeric PosInf | LString String | ...
```

This design:
- Models integers and floats as a coherent numeric family
- Enables cross-type comparison (NumInt 3 == NumFloat 3.0)
- Supports future compilation targets that distinguish int/float
- Provides natural extension point for numeric coercion

---

## Files Modified

### Compiler Pipeline (10 files)

| File | Changes |
|------|---------|
| `Lexer.x` | Added `@floatlit` pattern with scientific notation, `TokenFloat Double` token |
| `Parser.y` | Added `FLOAT` token, `LNumeric` production rules, `floatTok` accessor |
| `Direct.hs` | Defined `Numeric` type, replaced `LInt` with `LNumeric Numeric PosInf` |
| `DirectWOPats.hs` | Mirrored `Numeric` type and `LNumeric` changes |
| `CaseElimination.hs` | Updated `transLit` with `Numeric` conversion between Direct/DirectWOPats |
| `Core.hs` | Defined `Numeric` with custom `Eq/Ord/Serialize` instances, `lowerLit` conversion |
| `CPSOpt.hs` | Updated 6 constant folding locations for `LNumeric (NumInt ...)` |
| `IROpt.hs` | Replaced `IntConst Integer` with `NumericConst Numeric` in `PValue` |
| `RawOpt.hs` | Updated type inference and assertion optimization for `LNumeric` |

### Tests (2 files)

| File | Changes |
|------|---------|
| `compiler/test/ir2raw-test/testcases/Inst.hs` | Updated test to use `LNumeric (NumInt ...)` |
| `tests/rt/pos/core/tuples_idx04c.trp` | Fixed test: `0.0` now parses as float, not tuple index |

---

## Lexer Pattern

```alex
@floatlit   = $digit[\_$digit]* \. $digit[\_$digit]* ([eE][\+\-]? $digit[\_$digit]*)?

<0>   @floatlit  { mkLs (\s -> TokenFloat (read (filter (/='_') s))) }
```

**Important:** Float pattern must come BEFORE integer patterns since `3.14` would otherwise match `3` as an integer.

---

## Breaking Changes

1. **Serialization format changed**: `LInt` → `LNumeric` (old serialized code incompatible)
2. **Syntax change**: `0.0` now parses as float literal, not `0` followed by `.0` (tuple index)

---

## Verification

All tests pass:
- 365 golden tests
- IR2Raw unit tests
- 7 multinode tests

Test programs created in `tests/_unautomated/claude/`:
- `float_basic.trp` - Basic arithmetic
- `float_scientific.trp` - Scientific notation and underscores
- `float_comparison.trp` - Comparisons and cross-type equality

---

## Notes

- This also implements GitHub Issue #89 (underscore in float literals)
- JavaScript natively supports doubles, so code generation emits literals directly
- Serialization works automatically via `Data.Serialize` deriving for `Numeric`
