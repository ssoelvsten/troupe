# Bug 1: Duplicate Atom Names - IR Validation

## Status

Parser-level validation is complete. Test: `tests/cmp/duplicate-atoms.trp`

## Remaining Issue

`IR.wfIRProg` (`IR.hs`) has a TODO: "not checking atoms at the moment".

This is reachable: IR can be constructed manually and fed to the compiler backend via `receive`. The IR validation should be implemented to catch duplicates at this level.

## Proposed Fix

Add duplicate check in `wfIRProg`:

```haskell
wfIRProg :: IRProgram -> Except String ()
wfIRProg (IRProgram (C.Atoms atms) funs) = do
  let duplicates = atms \\ nub atms
  when (not (null duplicates)) $
    throwError $ "Duplicate constructor names: " ++ show (nub duplicates)
  mapM_ wfFun funs
```
