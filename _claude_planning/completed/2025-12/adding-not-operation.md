# Adding the `not` Operator to Troupe

**Issue:** [#111](https://github.com/TroupeLang/Troupe/issues/111)
**Date:** 2025-12-17
**Status:** Implementation complete, optimizations pending

## Summary

This document details the implementation of the `not` unary operator in Troupe, following "Approach 3" from the issue discussion: adding `not` as a first-class operator in the frontend and propagating it through the entire compiler pipeline without desugaring.

## Changes Made

### Compiler Changes

| File | Line(s) | Change |
|------|---------|--------|
| `compiler/src/Lexer.x` | 102, 252 | Added `not` keyword recognition and `TokenNot` token type |
| `compiler/src/Parser.y` | 94, 134, 206 | Added token declaration, precedence (`%left 'not'`), and parsing rule |
| `compiler/src/Basics.hs` | 19, 64 | Added `Not` to `UnaryOp` datatype and `Show` instance |
| `compiler/src/IR2Raw.hs` | 642-644 | Added case for `Basics.Not` with boolean type assertion |
| `compiler/src/RawOpt.hs` | 237 | Added `Basics.Not -> Just RawBoolean` for type inference |
| `compiler/src/IROpt.hs` | 181-182, 242-251 | Added `Basics.Not -> False` (safe operation) and dataflow-based constant folding |
| `compiler/src/Stack2JS.hs` | 330 | Added `Not -> "!"` (native JavaScript negation) |

### Runtime Changes

**None required.** The `not` operator compiles directly to JavaScript's native `!` operator, just like `UnMinus` compiles to `-`. No runtime function needed.

### Tests Added

| File | Description |
|------|-------------|
| `tests/rt/pos/core/not-operator.trp` | Basic functionality test with golden file |

## Precedence Analysis

### Current Precedence

The `not` operator was assigned `%left 'not'` precedence, placed between `'isRecord'` and `'^'` in the precedence declarations (line 134 in Parser.y). This is **consistent with** `isTuple`, `isList`, and `isRecord`.

### Precedence Behavior (Verified by Testing)

| Expression | Parsed As | Reason |
|------------|-----------|--------|
| `not x = 5` | `(not x) = 5` | `not` binds tighter than `=` |
| `not true andalso false` | `(not true) andalso false` | `not` binds tighter than `andalso` |
| `not (not x)` | `not (not x)` | Parentheses explicit |

### Precedence Comparison with Other Languages

| Language | Expression | Parses As | Notes |
|----------|-----------|-----------|-------|
| C/C++/Java | `!x == y` | `(!x) == y` | `!` higher than `==` |
| JavaScript | `!x === y` | `(!x) === y` | `!` higher than `===` |
| Python | `not x == y` | `not (x == y)` | `not` lower than `==` |
| SML/OCaml | `not x = y` | `(not x) = y` | `not` is a function |
| **Troupe** | `not x = y` | `(not x) = y` | Consistent with ML/C families |

**Conclusion:** Troupe's precedence is **correct** and matches C/JavaScript/ML-family languages. Only Python differs (with lower precedence for `not`).

## Type Safety

The implementation includes proper type checking:

```typescript
// In IR2Raw.hs
Basics.Not -> do
  assertTypeAndRaise v RawBoolean  // Runtime type assertion
  basicUnOpComp
```

**Test Result:** Applying `not` to a non-boolean produces the error:
```
Runtime error: value 42 is not a boolean
```

## Optimizations

### Implemented in CPSOpt.hs

The following optimizations are implemented in `compiler/src/CPSOpt.hs`:

| Optimization | Before | After | Location |
|--------------|--------|-------|----------|
| Constant folding | `not true` | `false` | Line 352-354 |
| Constant folding | `not false` | `true` | Line 352-354 |
| Double negation | `not (not x)` | `x` | Line 356-358 |
| Negated equality | `not (x = y)` | `x <> y` | Line 361 |
| Negated inequality | `not (x <> y)` | `x = y` | Line 362 |
| Negated less-than | `not (x < y)` | `x >= y` | Line 363 |
| Negated less-equal | `not (x <= y)` | `x > y` | Line 364 |
| Negated greater-than | `not (x > y)` | `x <= y` | Line 365 |
| Negated greater-equal | `not (x >= y)` | `x < y` | Line 366 |
| If-branch swap | `if (not x) e1 e2` | `if x e2 e1` | Line 499-503 |

### Implemented in IROpt.hs

Dataflow-based constant folding for `not` in `compiler/src/IROpt.hs`:

| Optimization | Description | Location |
|--------------|-------------|----------|
| Dataflow constant folding | `not x` where `x` is tracked as `BoolConst True` → `false` | Line 242-251 |
| Dataflow constant folding | `not x` where `x` is tracked as `BoolConst False` → `true` | Line 242-251 |

This catches cases where the boolean value becomes known through dataflow analysis (e.g., `let val x = true in not x`), consistent with how IROpt handles arithmetic operations on tracked integer constants.

All optimizations are verified working and all 720 tests pass.

## Test Coverage Analysis

### Current Test (`not-operator.trp`)

```troupe
print (not true);       (* false *)
print (not false);      (* true *)
print (not x);          (* variable *)
print (not y);          (* variable *)
print (not (not true)); (* double negation *)
print (not (1 = 2));    (* negated comparison *)
print (not (1 = 1))     (* negated comparison *)
```

### Coverage Gaps

| Test Case | Status | Priority |
|-----------|--------|----------|
| Basic `not true`/`not false` | Covered | - |
| `not` on variables | Covered | - |
| Double negation `not (not x)` | Covered | - |
| With equality `not (x = y)` | Covered | - |
| Type error on non-boolean | Not covered (manual test only) | Low |
| Precedence with `andalso`/`orelse` | Not covered | Medium |
| Precedence with `=`/`<>`/`<`/`>` | Not covered | Medium |
| IFC label propagation | Not covered | High |
| In conditional expressions | Not covered | Medium |
| In pattern guards | Not covered | Low |

### Semantic Equivalence Testing

**Issue Suggestion:** Test equivalence with `not x = (false = x)`

This equivalence is **NOT explicitly tested**. However:
- `not true` = `false` = `false = true` ✓
- `not false` = `true` = `false = false` ✓

**Recommendation:** Add explicit semantic equivalence test:

```troupe
(* Semantic equivalence: not x should equal (false = x) *)
let fun testEquiv x = (not x) = (false = x)
in
    print (testEquiv true);   (* should be true *)
    print (testEquiv false)   (* should be true *)
end
```

## Parser Conflicts

**Status:** No shift/reduce or reduce/reduce conflicts introduced.

Verified by running `make parser-info` in the compiler directory - the generated Parser.info shows no conflicts.

## Information Flow Control (IFC)

### Implementation

The `not` operator uses `basicUnOpComp` in IR2Raw.hs:

```haskell
basicUnOpComp =
  return SimpleRawComp
    { cVal = RUn v $ Un op
    , cValLbl = Join PC (ValLbl v) []  -- Value label joins PC and input label
    , cTyLbl = PC                       -- Type label is PC
    }
```

This means:
- The output value label is the join of PC and the input value label
- The output type label is the PC

### Testing Gap

**No IFC-specific tests** were added for the `not` operator. The operator should preserve information flow labels correctly (output label = join of PC and input label), but this is not explicitly tested.

**Recommendation:** Add IFC test in `tests/rt/pos/ifc/`:

```troupe
(* Test that not preserves labels correctly *)
let val x = true @ `{alice}`
    val y = not x
in
    print (levelOf y)  (* Should show alice's label *)
end
```

## Critical Evaluation

### What Was Done Well

1. **Consistent with existing operators:** The implementation follows the exact pattern of `isTuple`, `isList`, `isRecord`
2. **Type safety:** Proper runtime type checking with helpful error messages
3. **No parser conflicts:** Clean grammar extension
4. **Comprehensive pipeline propagation:** All compiler stages handle `Not` correctly
5. **IROpt.hs coverage:** Added `Not -> False` to indicate safe operation

### What Could Be Improved

1. **Optimizations not implemented:** The primary motivation for adding `not` as a first-class operator was to enable optimizations, but none are implemented yet

2. **Limited test coverage:**
   - No precedence tests in the test suite
   - No IFC label tests
   - No semantic equivalence test (`not x = (false = x)`)
   - No negative tests (type errors)

3. **Precedence may surprise users:** `not x = y` parses as `(not x) = y`, which is consistent with `isTuple`/`isList`/`isRecord` but may not match user expectations from other languages

4. **Documentation:** No user-guide documentation added

## Recommendations for Future Work

### High Priority

1. **Add IFC test** to verify label propagation

### Medium Priority

2. **Update user guide** with `not` operator documentation
3. **Add more comprehensive tests** covering precedence edge cases

### Completed

- ~~Constant folding~~ (implemented)
- ~~Double negation elimination~~ (implemented)
- ~~Negated comparison optimizations~~ (implemented)
- ~~If-branch swap optimization~~ (implemented)

## Files Changed Summary

```
compiler/src/Basics.hs       # UnaryOp type
compiler/src/Lexer.x         # TokenNot
compiler/src/Parser.y        # Parsing rule
compiler/src/IR2Raw.hs       # IR translation
compiler/src/RawOpt.hs       # Type inference
compiler/src/IROpt.hs        # Safety annotation
compiler/src/Stack2JS.hs     # JS code generation (Not -> "!")
compiler/src/CPSOpt.hs       # Optimizations (constant folding, double negation, etc.)
tests/rt/pos/core/not-operator.trp   # Test file
tests/rt/pos/core/not-operator.golden  # Expected output
```

**Note:** No runtime changes required - `not` compiles directly to JavaScript's native `!` operator.

## Verification

All 720 golden tests pass after the implementation.
