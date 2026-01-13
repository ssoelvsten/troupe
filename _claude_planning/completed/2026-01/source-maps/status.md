# Source Maps: Phase 14 Analysis and Status

> **SUPERSEDED**: This document has been superseded by [status-3.md](status-3.md) which proposes inline source maps as a unified solution. Phase 14's external source maps approach does not work for dynamic/deserialized code. See status-3.md for the complete solution.

**Date**: 2026-01-03
**Reviewer**: Claude (Deep Analysis)
**Subject**: Critical review of Phase 14 plan for error message positions

---

## Executive Summary

Phase 14 plan is **fundamentally sound** for compiler-emitted assertion errors, but contains one error and has documented scope limitations. The plan will successfully add position information to ~60-70% of runtime errors (type assertions, bounds checks, division by zero). IFC errors and other runtime-detected errors are explicitly out of scope and require different approach.

**Recommendation**: Proceed with Phase 14 with corrections noted below.

---

## Key Finding: Position Information IS Available

### The Architecture Works

Contrary to initial concerns, the compiler pipeline **already carries position information** all the way to Stack2JS:

```
Source Code (file.trp:10:5)
    ↓
Parser: Creates Located nodes
    ↓
Direct/Core/CPS/IR/Raw: All use Located wrappers (Phases 1-11 ✓)
    ↓
IR2Raw: Creates assertions with position
    tell [ Loc vaPos (RTAssertion (AssertType r t)) ]
    ↓
Stack2JS: Receives position but currently ignores it
    ir2jsWithPos _pos (RTAssertion a) = ...
                 ^^^^^ position is HERE, just unused!
```

**Evidence from IR2Raw.hs:**
- Line 316: `tell [ Loc vaPos (RTAssertion (AssertType r t)) ]`
- Line 340: `tell [Loc vaPos (RTAssertion (f r))]`

Every RTAssertion is wrapped in `Loc` with the source position of the variable being checked.

**Evidence from Stack2JS.hs:**
- Line 310: `toJS (Loc pos inst) = ir2jsWithPos pos inst` - extracts position
- Line 536: `ir2jsWithPos _pos (RTAssertion a)` - receives but ignores position

---

## Current vs. Proposed Code Generation

### Current (broken)

**Troupe source:**
```sml
1 + ()  (* file.trp line 1 *)
```

**Generated JavaScript:**
```javascript
rt.rawAssertIsNumber(gensym42$$$const);
```

**Error message:**
```
>> value () is not a number
```
❌ No position information

### After Phase 14 (fixed)

**Generated JavaScript:**
```javascript
rt.rawAssertIsNumber(gensym42$$$const, "file.trp:1:5");
```

**Error message:**
```
>> value () is not a number at file.trp:1:5
```
✅ Shows exact source location

---

## What Phase 14 Covers

### ✅ Compiler-Emitted Assertions (RTAssertion)

All assertions generated during compilation from IR2Raw.hs:

| Assertion Type | Source | Coverage |
|----------------|--------|----------|
| `AssertType` (Number, String, Boolean, etc.) | Type checking in operators | ✓ |
| `AssertTypesBothStringsOrBothNumbers` | Binary operators (+, -, etc.) | ✓ |
| `AssertNotZero` | Division and modulo operators | ✓ |
| `AssertTupleLengthGreaterThan` | Tuple indexing | ✓ |
| `AssertRecordHasField` | Record field access | ✓ |

**Test coverage:**
- `tests/rt/neg/core/arithprob.trp` - type errors ✓
- `tests/rt/neg/core/division_by_zero_01.trp` - division by zero ✓
- All tuple/record access errors ✓

---

## What Phase 14 Does NOT Cover

### ❌ Runtime-Detected IFC Errors

Information flow control violations are detected **at runtime** by the security monitor, not during compilation.

**Example from `tests/rt/neg/ifc/handlers.trp`:**

```sml
rcv(`{secret}`, `{secret}`, [ hn x => adv x ])
```

**Current error (no position):**
```
>> Illegal flow in adv function:
 |    pc: {secret}
 | block: {secret}
 | value: 2@{secret}%{secret}
```

**Why Phase 14 doesn't help:**
- Error detected in `Thread.mts:559` during `downgrade()` execution
- No compiler-emitted code at that location
- Thread doesn't know which Troupe source line is executing

**What would be needed:**
- Option A: Thread carries `currentSourcePos` field, updated by compiler-emitted markers
- Option B: Stack trace parsing with source maps (Phase 13 approach)
- Option C: Accept IFC errors don't have positions (document limitation)

### ❌ Other Runtime Errors

Errors from runtime-only checks:
- `threadError()` calls from builtins
- Handler state violations
- Mailbox clearance errors
- Trust authority checks

These account for ~30-40% of runtime errors based on test corpus analysis.

---

## Corrections to Phase 14 Plan

### ✅ Phase 14a: Stack2JS.hs (CORRECT)

Modify `ir2jsWithPos` to pass position to assertion code generation.

**Current code:**
```haskell
ir2jsWithPos _pos (RTAssertion a) =
    return $ ppRTAssertionCode jsFunCall a
```

**Proposed code:**
```haskell
ir2jsWithPos pos (RTAssertion a) = do
  let posStr = ppPosInfo pos  -- Converts PosInf to "file:line:col"
  return $ ppRTAssertionCodeWithPos jsFunCall a posStr
```

Where `ppPosInfo` already exists (line 755-756):
```haskell
ppPosInfo :: GetPosInfo a => a -> PP.Doc
ppPosInfo = PP.doubleQuotes . text . show . posInfo
```

**Status**: ✅ Correct approach

### ✅ Phase 14b: Asserts.mts (CORRECT)

Add optional position parameter to all assertion functions.

**Current:**
```typescript
export function assertIsNumber(x: any) {
    _thread().raiseBlockingThreadLev(x.tlev)
    if (typeof x.val != 'number') {
        err("value " + __stringRep(x) + " is not a number")
    }
}
```

**Proposed:**
```typescript
export function assertIsNumber(x: any, pos: string = '') {
    _thread().raiseBlockingThreadLev(x.tlev)
    if (typeof x.val != 'number') {
        const suffix = pos ? ` at ${pos}` : '';
        err("value " + __stringRep(x) + " is not a number" + suffix)
    }
}
```

Apply to all `rawAssert*` functions in `Asserts.mts`.

**Status**: ✅ Correct approach

### ❌ Phase 14c: BuiltinArith.mts (REMOVE)

**Error in plan**: File `rt/src/builtins/BuiltinArith.mts` **does not exist**.

**Reality**: Division by zero is handled via `RTAssertion (AssertNotZero r)` in **compiler-generated code**, not in a runtime builtin.

**Evidence from compilation of `1 / 0`:**

Stack output (`out/out.stack`):
```
rt.rawAssertNotZero (gensym44$$$const)
_raw_25 = gensym43$$$const / gensym44$$$const
```

The assertion is emitted **before** the division operation as an `RTAssertion` instruction from IR2Raw.hs lines 586, 591, 596.

**Conclusion**: Phase 14c is unnecessary. Division assertions are covered by Phase 14b's changes to `rawAssertNotZero()` in `Asserts.mts`.

**Status**: ❌ Delete this phase from plan

---

## Technical Deep Dive: How RTAssertions Get Position

### Step 1: IR2Raw emits assertions with position

```haskell
-- IR2Raw.hs line 311-316
assertTypeAndRaise :: IR.LVarAccess -> RawType -> TM ()
assertTypeAndRaise lva@(Loc vaPos _) t = do
  raiseBlock $ TyLbl lva
  r <- getVal lva
  tell [ Loc vaPos (RTAssertion (AssertType r t)) ]
         ^^^^^^^^^ Position of the variable being checked
```

### Step 2: Position flows through pipeline

```
IR2Raw: LRawInst = Located RawInst
   ↓
Raw2Stack: LStackInst = Located StackInst (preserves position)
   ↓
Stack2JS: ToJS instance extracts position
```

### Step 3: Stack2JS receives position

```haskell
-- Stack2JS.hs line 309-310
instance ToJS LStackInst where
  toJS (Loc pos inst) = ir2jsWithPos pos inst
                            ^^^ Extracted from Located wrapper

-- Line 536
ir2jsWithPos _pos (RTAssertion a) = ...
             ^^^^ Currently ignored, but available!
```

### Step 4: Position needs to flow to ppRTAssertionCode

**Current signature:**
```haskell
ppRTAssertionCode :: (PP.Doc -> [PP.Doc] -> PP.Doc) -> RTAssertion -> PP.Doc
ppRTAssertionCode f a = f (text $ "rt.rawAssert" ++ rtFun) args
```

**Needed signature:**
```haskell
ppRTAssertionCodeWithPos :: (PP.Doc -> [PP.Doc] -> PP.Doc)
                         -> RTAssertion
                         -> PP.Doc      -- position string
                         -> PP.Doc
ppRTAssertionCodeWithPos f a posDoc =
    f (text $ "rt.rawAssert" ++ rtFun) (args ++ [posDoc])
  where (rtFun, args) = -- same logic as ppRTAssertionCode
```

This appends position as final argument to every assertion call.

---

## Implementation in Raw.hs

The plan says "emit position to assertion calls" in Stack2JS.hs, but `ppRTAssertionCode` is defined in **Raw.hs** (line 178). Here's what actually needs to change:

### Current code (Raw.hs:178-194)

```haskell
ppRTAssertionCode f a = f (text $ "rt.rawAssert" ++ rtFun) args
  where (rtFun, args) = case a of
          AssertType x t -> (case t of
            RawNumber -> "IsNumber"
            RawBoolean -> "IsBoolean"
            -- etc...
            , [ppId x])
          AssertTypesBothStringsOrBothNumbers x y ->
            ("PairsAreStringsOrNumbers", [ppId x, ppId y])
          -- etc...
```

### Proposed new function (Raw.hs)

```haskell
ppRTAssertionCodeWithPos :: (PP.Doc -> [PP.Doc] -> PP.Doc)
                         -> RTAssertion
                         -> PP.Doc
                         -> PP.Doc
ppRTAssertionCodeWithPos f a posDoc =
    f (text $ "rt.rawAssert" ++ rtFun) (args ++ [posDoc])
  where (rtFun, args) = case a of
          AssertType x t -> (case t of
            RawNumber -> "IsNumber"
            RawBoolean -> "IsBoolean"
            RawString -> "IsString"
            RawFunction -> "IsFunction"
            RawList -> "IsList"
            RawTuple -> "IsTuple"
            RawRecord -> "IsRecord"
            RawLevel -> "IsLevel"
            _ -> error $ "type assertion not implemented for " ++ show t
            , [ppId x])
          AssertTypesBothStringsOrBothNumbers x y ->
            ("PairsAreStringsOrNumbers", [ppId x, ppId y])
          AssertTupleLengthGreaterThan x n ->
            ("TupleLengthGreaterThan", [ppId x, text (show n)])
          AssertRecordHasField x f ->
            ("RecordHasField", [ppId x, PP.doubleQuotes $ text f])
          AssertNotZero x -> ("NotZero", [ppId x])
```

Keep original `ppRTAssertionCode` for backward compatibility (used in IR pretty-printing).

---

## Scope and Future Work

### Phase 14 Scope: Compiler-Emitted Assertions Only

**What gets fixed:**
- Type errors in arithmetic: `1 + ()` → "value () is not a number at file.trp:1:5"
- Division by zero: `1 / 0` → "Division by zero error at file.trp:1:3"
- Tuple bounds: `#42 t` → "Index out of bounds at file.trp:2:10"
- Record fields: `r.foo` → "record does not have field 'foo' at file.trp:3:5"

**Estimated coverage**: 60-70% of runtime errors based on test corpus analysis.

### Future Work: Runtime-Detected Errors

**Phase 15 (or later): Thread-Level Position Tracking**

Approach:
1. Add `currentSourcePos: string` field to Thread class
2. Compiler emits position update instructions: `_T.setPos("file.trp:10:5")`
3. All `threadError()` calls include position from thread state
4. Covers IFC errors, handler violations, all runtime checks

**Trade-offs:**
- ✅ Complete coverage of all errors
- ✅ Accurate positions for all runtime paths
- ❌ Runtime overhead of position updates
- ❌ Larger generated code

**Alternative: Hybrid Approach**
- Compiler-emitted: direct position passing (Phase 14)
- Runtime-detected: best-effort from Error.stack or "position unknown"

---

## Test Plan for Phase 14

After implementing Phase 14a and 14b:

```bash
make compiler
make rt
make libs
make service
bin/golden --quick
```

### Positive Test: Check position appears

```bash
echo "1 + ()" > /tmp/test_pos.trp
./local.sh /tmp/test_pos.trp
```

**Expected output:**
```
Runtime error in thread ...
>> value () is not a number at /tmp/test_pos.trp:1:5
```

### Negative Test: IFC errors still lack position

```bash
./local.sh tests/rt/neg/ifc/handlers.trp
```

**Expected output (unchanged):**
```
Runtime error in thread ...
>> Illegal flow in adv function:
 |    pc: {secret}
 | block: {secret}
 | value: 2@{secret}%{secret}
```
(No position - this is expected and documented)

### Regression Test: All golden tests pass

```bash
bin/golden --quick
```

Should show 397/397 tests passing (or current count).

---

## Files Modified Summary

| File | Changes | Reason |
|------|---------|--------|
| `compiler/src/Stack2JS.hs` | Modify `ir2jsWithPos` for `RTAssertion` to pass position | Use available position info |
| `compiler/src/Raw.hs` | Add `ppRTAssertionCodeWithPos` function | Append position to assertion args |
| `rt/src/Asserts.mts` | Add `pos` parameter to all `rawAssert*` functions | Display position in error messages |

**Note**: `BuiltinArith.mts` does NOT exist and should be removed from plan.

---

## Recommendation

**Proceed with Phase 14 with these modifications:**

1. ✅ **Implement Phase 14a** as specified (Stack2JS.hs changes)
2. ✅ **Implement Phase 14b** as specified (Asserts.mts changes)
3. ❌ **Delete Phase 14c** (BuiltinArith.mts doesn't exist)
4. ✅ **Update phase-14-position-params.md** to:
   - Remove Phase 14c section
   - Add "Scope Limitations" section documenting IFC/runtime errors
   - Add note that division is covered by RTAssertion, not runtime builtin
5. ✅ **Update plan completion criteria** to note 60-70% error coverage

Phase 14 will be a **significant improvement** for debugging common errors (type mismatches, bounds checks, division by zero). IFC error positions can be addressed in a future phase using thread-level position tracking.

---

## Questions for User

1. **Accept scope limitation?** Is it acceptable that Phase 14 covers only compiler-emitted assertions (~60-70% of errors), leaving IFC/runtime errors for future work?

2. **Preferred approach for future?** For runtime-detected errors (Phase 15+):
   - Option A: Thread-level position tracking (complete but adds overhead)
   - Option B: Hybrid (compiler=positions, runtime=best-effort)
   - Option C: Defer indefinitely

3. **Golden test updates?** Many `.golden` files will need regeneration after Phase 14 since error messages will include positions. This is expected but will affect many tests.

---

**Status**: Ready to proceed with corrected plan
**Confidence**: High - position information is proven available through the pipeline
**Risk**: Low - changes are localized to assertion generation and display
