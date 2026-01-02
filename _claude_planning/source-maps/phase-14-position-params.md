# Phase 14: Error Message Positions

**Status**: Pending

**Goal**: For compiler-emitted calls, pass position directly for immediate display without needing stack trace resolution.

---

## Phase 14a: Stack2JS.hs - Emit position to assertion calls

**File**: `compiler/src/Stack2JS.hs`

When generating RTAssertion calls, include position as a string argument:

```haskell
ir2js (Stack.RTAssertion assertion pos) = do
  recordMapping pos
  let posStr = case pos of
        SrcPosInf f l c -> PP.doubleQuotes $ text $ f ++ ":" ++ show l ++ ":" ++ show c
        _ -> PP.doubleQuotes $ text ""
  return $ ppRTAssertionCodeWithPos assertion posStr

ppRTAssertionCodeWithPos :: RTAssertion -> PP.Doc -> PP.Doc
ppRTAssertionCodeWithPos assertion posDoc =
  ppRTAssertionCode (\fn args -> ppFunCall fn (args ++ [posDoc])) assertion
```

---

## Phase 14b: Asserts.mts - Add position parameter

**File**: `rt/src/Asserts.mts`

Add optional position parameter to all assertion functions:

```typescript
// Before:
export function assertIsNumber(x: any) {
    if (typeof x !== 'number') {
        _thread().threadError(`value ${pp(x)} is not a number`)
    }
}

// After:
export function assertIsNumber(x: any, pos: string = '') {
    if (typeof x !== 'number') {
        const suffix = pos ? ` at ${pos}` : '';
        _thread().threadError(`value ${pp(x)} is not a number${suffix}`);
    }
}
```

Apply same pattern to:
- `assertIsString`
- `assertIsBoolean`
- `assertIsFunction`
- `assertIsLevel`
- `assertIsAuthority`
- `assertIsNTuple`
- etc.

---

## Phase 14c: BuiltinArith.mts - Add position to division

**File**: `rt/src/builtins/BuiltinArith.mts`

```typescript
// Before:
intdiv = mkBase((x) => {
    if (divisor === 0) {
        this.runtime.$t.threadError('Division by zero error');
    }
})

// After:
intdiv = mkBase((x, pos = '') => {
    if (divisor === 0) {
        const suffix = pos ? ` at ${pos}` : '';
        this.runtime.$t.threadError(`Division by zero error${suffix}`);
    }
})
```

---

## Test

After completing this phase:
```bash
make compiler
make rt
bin/golden --quick
```

Trigger a type error or division by zero. Verify the error message shows `at file:line:col` directly.

---

## Files Modified

| File | Changes |
|------|---------|
| `compiler/src/Stack2JS.hs` | Emit position argument to assertions |
| `rt/src/Asserts.mts` | Add pos parameter to all assertions |
| `rt/src/builtins/BuiltinArith.mts` | Add pos parameter to division |

---

## Completion

This is the final phase. After completing it, all Troupe runtime errors will show source location in error messages.
