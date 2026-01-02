# Phase 13b: Prepare RetDFCPS for Position Threading (Non-Breaking)

## Goal

This phase does **not** change the `trans` function signature. Instead, it adds a helper function that will be used in Phase 13h when we capture actual operand positions.

## Approach

1. Add a helper function for combining positions with a fallback
2. Keep existing trans/transExplicit signatures unchanged
3. All existing code continues to work identically

## Files to Modify

- `compiler/src/RetDFCPS.hs`

## Changes

### 1. Add import for TroupePositionInfo (if not already present)

```haskell
import TroupePositionInfo (PosInf(..), GetPosInfo(..))
```

### 2. Add helper function for Phase 13g

This helper combines an operand position with a fallback statement position:

```haskell
-- | Use operand position if available, otherwise use statement position as fallback
-- posOrFallback operandPos stmtPos returns operandPos if not NoPos, else stmtPos
posOrFallback :: PosInf -> PosInf -> PosInf
posOrFallback NoPos fallback = fallback
posOrFallback pos _ = pos
```

### 3. Document the future change point

Add a comment at the key location where position is discarded:

```haskell
trans (Core.Var (Core.RegVar x) pos) context = context (VN x)
-- NOTE: Position 'pos' is currently discarded here.
-- Phase 13h will capture this by using posInfo on operand expressions.
```

## What Does NOT Change

- `trans` function signature: still `(VarName -> S KTerm)`
- `transExplicit` function signature
- All CPS term construction
- All downstream modules

## Testing

```bash
make all && make test
```

All must pass. This phase adds no behavioral changes.

## Next Phase

Phase 13c: Add operand position fields (`PosInf`) to Raw.RawExpr.
