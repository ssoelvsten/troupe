# Position Information Tracking Status

This document summarizes the inconsistencies found in position tracking through the Troupe compiler pipeline.

## Overview

Position information flows through multiple AST representations in the compiler. The current implementation has several inconsistencies that prevent proper source location tracking for runtime errors.

## Current Position Representation

### `TroupePositionInfo.PosInf`
```haskell
data PosInf = SrcPosInf String Int Int  -- filename, line, column
            | RTGen String              -- runtime-generated
            | NoPos                     -- no position
```

### `Located` wrapper
```haskell
data Located a = Loc !PosInf a
```

## Pipeline Position Flow

### 1. Parser → Syntax (`Parser.y`, `Syntax.hs`)
- **Pattern**: Uses `LTerm = Located Term`
- **Example**: `atPos $1 (Lit LUnit)` properly attaches position to `()` literal
- ✅ Literals get positions from parser

### 2. Syntax → DirectWOPats (`CaseElimination.hs`)
- **Problem**: `DirectWOPats.Term` has `Lit Lit` without position
- **Issue at line 265**:
  ```haskell
  transTerm _ (S.Lit lit) = return (T.Lit (transLit lit))
  ```
  The position `_` is discarded for all literals!
- ❌ Position lost for all literals except in their internal structure

### DirectWOPats.Term Position Patterns

| Constructor | Has Position? |
|-------------|---------------|
| `Lit Lit` | ❌ No |
| `Var VarName PosInf` | ✅ Yes |
| `Abs Lambda PosInf` | ✅ Yes |
| `App Term [Term] PosInf` | ✅ Yes |
| `If Term Term Term PosInf` | ✅ Yes |
| `Tuple [Term] PosInf` | ✅ Yes |
| `Error Term PosInf` | ✅ Yes |
| ... | ✅ Yes |

**Only `Lit Lit` lacks a position field!**

### DirectWOPats.Lit Position Patterns

| Constructor | Has Position? |
|-------------|---------------|
| `LNumeric Numeric PosInf` | ✅ Yes |
| `LString String` | ❌ No |
| `LLabel String` | ❌ No |
| `LDCLabel DCLabelExp` | ❌ No |
| `LUnit` | ❌ No |
| `LBool Bool` | ❌ No |
| `LAtom AtomName` | ❌ No |

**Only `LNumeric` carries a position!**

### 3. DirectWOPats → Core (`Core.hs`)
- **Pattern**: Uses `type LTerm = Located Term`
- **Problem**: The `lower` function for literals uses `litPos`:
  ```haskell
  lower (D.Lit l) = Loc (litPos l) (Lit (lowerLit l))
    where
      litPos (D.LNumeric _ pi) = pi
      litPos _ = NoPos  -- <-- All non-numeric literals get NoPos!
  ```
- ❌ Non-numeric literals lose position

### 4. Core → CPS → IR
- Uses `Located` wrappers consistently
- Position preserved if present in Core

### 5. IR → Raw (`IR2Raw.hs`)
- **Good pattern for assertions**:
  ```haskell
  assertTypeAndRaise lva@(Loc vaPos _) t = do
    tell [ Loc vaPos (RTAssertion (AssertType r t)) ]
  ```
- Positions from `LVarAccess` are used for assertions
- ❌ If the original literal had `NoPos`, the assertion has `NoPos`

### 6. Raw → Stack → JS (`Raw2Stack.hs`, `Stack2JS.hs`)
- Source map markers emitted via `emitMarker pos`
- Only `SrcPosInf` positions emit markers
- `NoPos` and `RTGen` result in no source map entry

## Impact on Runtime Error Reporting

### Failing Test: `fib-untyped.trp`
```troupe
then fib (x - 1) + ()
```

The `+` operator generates type assertions for both operands:
1. First operand `fib (x - 1)` has position (from variable access)
2. Second operand `()` has `NoPos` (unit literal position lost)

Generated assertions:
```javascript
/* pos=tests/rt/.../fib-untyped.trp:3:12 */rt.rawAssertIsNumber (_$reg0_val_95);
/* pos= */rt.rawAssertIsNumber (gensym46$$$const);  // <-- NoPos!
```

When `()` fails the assertion, there's no source map entry for that line.

## Recommended Fix

### Option 1: Add position to `DirectWOPats.Term.Lit`
Change:
```haskell
data Term
    = Lit Lit        -- current
```
To:
```haskell
data Term
    = Lit Lit PosInf -- with position
```

**Pros**:
- Consistent with other Term constructors
- Clean propagation

**Cons**:
- Requires updating all `Lit` pattern matches across codebase

### Option 2: Add position to all `DirectWOPats.Lit` constructors
Change each literal constructor to carry `PosInf`:
```haskell
data Lit
    = LNumeric Numeric PosInf  -- already has
    | LString String PosInf    -- add
    | LLabel String PosInf     -- add
    | LUnit PosInf             -- add
    | LBool Bool PosInf        -- add
    | LAtom AtomName PosInf    -- add
    | LDCLabel DCLabelExp PosInf -- add
```

**Pros**:
- Position in the literal itself

**Cons**:
- More invasive change
- Inconsistent with Haskell convention (literals don't usually carry positions)

### Option 3: Use `Located` wrapper in DirectWOPats
Change to use `Located Term` instead of embedding positions in each constructor.

**Pros**:
- Cleaner separation of content and position
- Consistent with Core's approach

**Cons**:
- Larger refactor
- Changes the Term data type significantly

## Files Requiring Changes

For Option 1 (recommended):

1. **DirectWOPats.hs** - Add `PosInf` to `Lit` constructor
2. **CaseElimination.hs** - Update `transTerm _ (S.Lit lit)` to pass position
3. **Core.hs** - Update `lower (D.Lit l)` to use position from Lit constructor
4. **All pattern matches on `Lit`** - Add position parameter

## Current Workaround Status

In `Stack2JS.hs`, `RTAssertion` now emits source map markers (fix applied). However, if the position is `NoPos`, no marker is emitted and the source location cannot be resolved.

The root cause is in the early pipeline (CaseElimination.hs discarding literal positions), not in the later stages.
