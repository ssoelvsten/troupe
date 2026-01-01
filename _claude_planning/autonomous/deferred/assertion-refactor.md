# Task: Refactor Assertion Code Generation

Status: deferred as a low-priority internal chore

## Source
GitHub Issue #67: https://github.com/TroupeLang/Troupe/issues/67
Labels: `good first issue`, `code quality`, `compiler (Back-end)`

The TODO comment at `/compiler/src/Raw.hs:164-166`:
```haskell
-- TODO: 2025-09-19; AA -- this is a bit too hacky
                        -- we should not be referencing runtime functions
                        -- by concatenating their names
```

## Objective

Refactor the assertion code generation in the compiler to avoid string concatenation for runtime function names. Instead, use a proper mapping or enum-like structure.

## Current Implementation

**File: `/compiler/src/Raw.hs` (lines 164-184)**

```haskell
-- TODO: 2025-09-19; AA -- this is a bit too hacky
                        -- we should not be referencing runtime functions
                        -- by concatenating their names
ppRTAssertionCode f a = f (text $ "rt.rawAssert" ++ rtFun) args
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
          AssertTypesBothStringsOrBothNumbers x y -> ("PairsAreStringsOrNumbers", [ppId x, ppId y])
          AssertTupleLengthGreaterThan x n -> ("TupleLengthGreaterThan", [ppId x, text (show n)])
          AssertRecordHasField x f -> ("RecordHasField", [ppId x, PP.doubleQuotes $ text f])
          AssertNotZero x -> ("NotZero", [ppId x])
```

**Problem:** Function names are constructed via string concatenation (`"rt.rawAssert" ++ rtFun`), making them:
1. Hard to track/refactor
2. Not type-safe
3. Could lead to typos or mismatches with runtime

## Runtime Functions

The runtime defines these assertion functions in `/rt/src/Asserts.mts`:

| Runtime Function | Called From |
|------------------|-------------|
| `rawAssertIsNumber` | `AssertType x RawNumber` |
| `rawAssertIsBoolean` | `AssertType x RawBoolean` |
| `rawAssertIsString` | `AssertType x RawString` |
| `rawAssertIsFunction` | `AssertType x RawFunction` |
| `rawAssertIsList` | `AssertType x RawList` |
| `rawAssertIsTuple` | `AssertType x RawTuple` |
| `rawAssertIsRecord` | `AssertType x RawRecord` |
| `rawAssertIsLevel` | `AssertType x RawLevel` |
| `rawAssertPairsAreStringsOrNumbers` | `AssertTypesBothStringsOrBothNumbers` |
| `rawAssertTupleLengthGreaterThan` | `AssertTupleLengthGreaterThan` |
| `rawAssertRecordHasField` | `AssertRecordHasField` |
| `rawAssertNotZero` | `AssertNotZero` |

---

## Proposed Solution

Create explicit full function name strings instead of concatenation:

```haskell
ppRTAssertionCode f a = f (text rtFunName) args
  where (rtFunName, args) = case a of
          AssertType x t -> (rtAssertTypeFun t, [ppId x])
          AssertTypesBothStringsOrBothNumbers x y ->
            ("rt.rawAssertPairsAreStringsOrNumbers", [ppId x, ppId y])
          AssertTupleLengthGreaterThan x n ->
            ("rt.rawAssertTupleLengthGreaterThan", [ppId x, text (show n)])
          AssertRecordHasField x field ->
            ("rt.rawAssertRecordHasField", [ppId x, PP.doubleQuotes $ text field])
          AssertNotZero x ->
            ("rt.rawAssertNotZero", [ppId x])

-- Explicit mapping from type to full runtime function name
rtAssertTypeFun :: RawType -> String
rtAssertTypeFun t = case t of
    RawNumber   -> "rt.rawAssertIsNumber"
    RawBoolean  -> "rt.rawAssertIsBoolean"
    RawString   -> "rt.rawAssertIsString"
    RawFunction -> "rt.rawAssertIsFunction"
    RawList     -> "rt.rawAssertIsList"
    RawTuple    -> "rt.rawAssertIsTuple"
    RawRecord   -> "rt.rawAssertIsRecord"
    RawLevel    -> "rt.rawAssertIsLevel"
    _           -> error $ "type assertion not implemented for " ++ show t
```

**Benefits:**
1. Full function names are explicit and searchable
2. Easy to grep for function references
3. Compiler will catch typos at compile time (if mistyped string)
4. Easier to update if runtime function names change

---

## Files to Modify

### `/compiler/src/Raw.hs`

1. Replace lines 164-184 with refactored version
2. Add the `rtAssertTypeFun` helper function
3. Remove the TODO comment

---

## Verification Steps

1. Build the compiler:
   ```bash
   make stack
   ```

2. Run the test suite:
   ```bash
   make test
   ```

3. Verify generated JavaScript contains correct assertion calls:
   ```bash
   ./local.sh tests/rt/pos/core/tuples01.trp --debug
   # Check output contains proper rawAssert* calls
   ```

## Notes

- This is a pure refactoring - no behavioral changes
- The runtime functions remain unchanged
- Consider adding a comment documenting the correspondence between compiler assertions and runtime functions
