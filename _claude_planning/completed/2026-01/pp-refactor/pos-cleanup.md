# Plan: Clean Up Position Handling Inconsistencies

## Summary

Clean up two anti-patterns in the compiler's position handling:
1. **Pattern 1**: `(VarName, PosInf)` tuples and `VarName PosInf` separate args → `LVarName`
2. **Pattern 2**: Plain `VarAccess` → `LVarAccess` in `MkFunClosures`

---

## Phase 1: MkFunClosures VarAccess → LVarAccess (Isolated, Low Risk)

### Files to Modify

| File | Change |
|------|--------|
| [IR.hs:127](compiler/src/IR.hs#L127) | `MkFunClosures [(VarName, VarAccess)]` → `[(VarName, LVarAccess)]` |
| [ClosureConv.hs:150-155](compiler/src/ClosureConv.hs#L150) | `mkEnvBindings` returns `[(VarName, LVarAccess)]`, takes `PosInf` param |
| [ClosureConv.hs:215,239](compiler/src/ClosureConv.hs#L215) | Pass position to `mkEnvBindings` |
| [IROpt.hs:446](compiler/src/IROpt.hs#L446) | Change `markUsed' x` → `markUsedL' lx` |
| [IROpt.hs:458](compiler/src/IROpt.hs#L458) | Same change in commented code (or remove) |
| [IR2Raw.hs:725](compiler/src/IR2Raw.hs#L725) | Remove workaround `Loc pos va` wrapping |

### Detailed Changes

**IR.hs:127**
```haskell
-- FROM:
| MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]
-- TO:
| MkFunClosures [(VarName, LVarAccess)] [(VarName, HFN)]
```

**ClosureConv.hs:150-155**
```haskell
-- FROM:
mkEnvBindings fv = do
  lev <- askLev
  let (freeVars', boundVars) = Data.List.partition (\(_, l) -> l <= lev - 1 ) fv
  let envVars = (map (\(v,_) -> (v, VarLocal v)) boundVars)
                      ++ (map (\(v,_) -> (v, VarEnv v)) freeVars')
  return envVars

-- TO:
mkEnvBindings :: PosInf -> Frees -> CC [(VarName, LVarAccess)]
mkEnvBindings pos fv = do
  lev <- askLev
  let (freeVars', boundVars) = Data.List.partition (\(_, l) -> l <= lev - 1 ) fv
  let envVars = (map (\(v,_) -> (v, Loc pos (VarLocal v))) boundVars)
                      ++ (map (\(v,_) -> (v, Loc pos (VarEnv v))) freeVars')
  return envVars
```

**ClosureConv.hs:214-215** (call site 1)
```haskell
-- FROM:
envBindings <- mkEnvBindings freeVars
-- TO:
envBindings <- mkEnvBindings stPos freeVars
```

**ClosureConv.hs:239** (call site 2)
```haskell
-- FROM:
envBindings <- mkEnvBindings (freeVars \\ vnames_orig')
-- TO:
envBindings <- mkEnvBindings funDeclPos (freeVars \\ vnames_orig')
```

**IROpt.hs:445-447**
```haskell
-- FROM:
MkFunClosures envs hfns -> do
    mapM (\(_, x) -> markUsed' x) envs
    return $ RIns linst
-- TO:
MkFunClosures envs hfns -> do
    mapM_ (\(_, lx) -> markUsedL' lx) envs
    return $ RIns linst
```

**IR2Raw.hs:721-726**
```haskell
-- FROM:
IR.MkFunClosures vs env -> do
    let vs' = map (\(vn, va) -> (vn, Loc pos va)) vs
    tell [Loc pos (MkFunClosures vs' env)]
-- TO:
IR.MkFunClosures vs env -> do
    tell [Loc pos (MkFunClosures vs env)]
```

### Test After Phase 1
```bash
make compiler && make test
```

---

## Phase 2: Lambda Parameter Positions (Larger Scope)

### Overview

Change `(VarName, PosInf)` and `VarName PosInf` patterns to use `LVarName = Located VarName`.

### Sub-Phase 2a: DirectWOPats.hs

| File | Change |
|------|--------|
| [DirectWOPats.hs:54](compiler/src/DirectWOPats.hs#L54) | `Lambda [(VarName, PosInf)]` → `Lambda [LVarName]` |
| [CaseElimination.hs:65](compiler/src/CaseElimination.hs#L65) | Construct `[LVarName]` instead of pairs |

**DirectWOPats.hs** - Add type alias and update Lambda:
```haskell
type LVarName = Located VarName

data Lambda = Lambda [LVarName] LTerm
```

### Sub-Phase 2b: Core.hs

| File | Change |
|------|--------|
| [Core.hs:58](compiler/src/Core.hs#L58) | `Unary VarName PosInf` → `Unary LVarName` |
| Core.hs (various) | Update `lowerLam`, `renameLambda`, pattern matches |

**Core.hs**:
```haskell
type LVarName = Located VarName

data Lambda = Unary LVarName LTerm
            | Nullary LTerm
```

### Sub-Phase 2c: RetCPS.hs + Consumers

| File | Change |
|------|--------|
| [RetCPS.hs:68](compiler/src/RetCPS.hs#L68) | `Unary VarName PosInf` → `Unary LVarName` |
| RetDFCPS.hs | Update transformation |
| RetFreeVars.hs | Update pattern matches |
| RetRewrite.hs | Update pattern matches |
| CPSOpt.hs | Update pattern matches |

**RetCPS.hs** (LVarName already defined at line 66):
```haskell
data KLambda = Unary LVarName LKTerm
             | Nullary LKTerm
```

### Sub-Phase 2d: IR.hs FunDef

| File | Change |
|------|--------|
| [IR.hs:138-143](compiler/src/IR.hs#L138) | `FunDef HFN VarName PosInf` → `FunDef HFN LVarName` |
| ClosureConv.hs | Update `transFunDec` |
| IR2Raw.hs | Update FunDef handling |

**IR.hs**:
```haskell
type LVarName = Located VarName

data FunDef = FunDef
                    HFN         -- name of the function
                    LVarName    -- argument (name + position)
                    Consts      -- constants
                    IRBBTree    -- body
```

### Test After Each Sub-Phase
```bash
make compiler && make test
```

---

## Important Notes on Testing

- Some tests may fail during the refactoring - this is expected
- Do NOT debug failing tests by modifying `.golden` files
- Do NOT modify any `.golden` files as part of this refactoring
- Failing tests are likely due to cascading issues that will be fixed in subsequent phases
- Focus on getting the compiler to build at each phase

---

## Implementation Order

1. **Phase 1** - MkFunClosures (do first, isolated change)
2. **Phase 2a** - DirectWOPats.hs Lambda
3. **Phase 2b** - Core.hs Lambda
4. **Phase 2c** - RetCPS.hs KLambda + consumers
5. **Phase 2d** - IR.hs FunDef

Each phase should compile and pass tests before proceeding.

---

## Files Summary

### Phase 1 (4 files)
- `compiler/src/IR.hs`
- `compiler/src/ClosureConv.hs`
- `compiler/src/IROpt.hs`
- `compiler/src/IR2Raw.hs`

### Phase 2 (10+ files)
- `compiler/src/DirectWOPats.hs`
- `compiler/src/CaseElimination.hs`
- `compiler/src/Core.hs`
- `compiler/src/RetCPS.hs`
- `compiler/src/RetDFCPS.hs`
- `compiler/src/RetFreeVars.hs`
- `compiler/src/RetRewrite.hs`
- `compiler/src/CPSOpt.hs`
- `compiler/src/IR.hs` (FunDef)
- `compiler/src/ClosureConv.hs` (transFunDec)
