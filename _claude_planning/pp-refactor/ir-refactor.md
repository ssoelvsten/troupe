# Analysis: Located Types Usage in Troupe Compiler IR Pipeline

## Executive Summary

The Troupe compiler has **partial adoption of Located types** (types wrapped with source position information). The early stages (RetCPS, IR) properly use Located wrappers, but **position information is lost** during the transition to Raw and Stack IRs.

**Key Finding**: Types like `VarAccess` should consistently use `LVarAccess` (Located VarAccess) throughout the pipeline, but currently they regress to unlocated types in later stages.

---

## Current State by IR Stage

### 1. RetCPS IR ✓ GOOD

**File:** `compiler/src/RetCPS.hs`

Uses Located types consistently:
```haskell
type LVarName = Located VarName

data SimpleTerm
   = Bin BinOp LVarName LVarName
   | Un UnaryOp LVarName
   | Tuple [LVarName]
   | Record LFields          -- LFields = [(FieldName, LVarName)]
   | WithRecord LVarName LFields
   | ProjField LVarName FieldName
   | ProjIdx LVarName Word
   | List [LVarName]
   | ListCons LVarName LVarName
```

### 2. IR (Main Intermediate Representation) ⚠️ MIXED

**File:** `compiler/src/IR.hs`

**IRExpr - GOOD:** Uses LVarAccess consistently
```haskell
type LVarAccess = Located VarAccess
type LFields = [(Basics.FieldName, LVarAccess)]

data IRExpr
  = Bin Basics.BinOp LVarAccess LVarAccess
  | Un Basics.UnaryOp LVarAccess
  | Tuple [LVarAccess]
  | Record LFields
  | WithRecord LVarAccess LFields
  | ProjField LVarAccess Basics.FieldName
  | ProjIdx LVarAccess Word
  | List [LVarAccess]
  | ListCons LVarAccess LVarAccess
```

**IRTerminator - BAD:** Uses plain VarAccess (loses position)
```haskell
data IRTerminator
  = TailCall VarAccess VarAccess          -- ❌ LOSES POSITION
  | Ret VarAccess                         -- ❌ LOSES POSITION
  | If VarAccess IRBBTree IRBBTree        -- ❌ LOSES POSITION
  | AssertElseError VarAccess IRBBTree VarAccess
  | Error VarAccess
  | LibExport VarAccess                   -- ❌ LOSES POSITION
  | StackExpand VarName IRBBTree IRBBTree
```

**Note:** Instructions and terminators themselves ARE wrapped (`LIRInst`, `LIRTerminator`), but the VarAccess fields inside them are not located.

### 3. Raw IR ❌ INCONSISTENT

**File:** `compiler/src/Raw.hs`

**Properly Located:**
```haskell
type LRawInst = Located RawInst
type LRawTerminator = Located RawTerminator
type LFunDef = Located FunDef
```

**Missing Locations - VarAccess in RawExpr:**
```haskell
data RawExpr
  = ProjectLVal VarAccess LValField        -- ❌ LOSES POSITION
  | Tuple [VarAccess]                      -- ❌ LOSES POSITION
  | List [VarAccess]                       -- ❌ LOSES POSITION
  | ListCons VarAccess RawVar              -- ❌ LOSES POSITION
  | Record Fields                          -- Fields = [(FieldName, VarAccess)] ❌
  | WithRecord RawVar Fields               -- ❌ LOSES POSITION
```

**Missing Locations - VarAccess in RawInst:**
```haskell
data RawInst
  = MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]  -- ❌
```

**Missing Locations - VarAccess in RawTerminator:**
```haskell
data RawTerminator
  = LibExport VarAccess                    -- ❌ LOSES POSITION
```

### 4. Stack IR ❌ INHERITED ISSUES

**File:** `compiler/src/Stack.hs`

Inherits all issues from Raw IR since it reuses Raw types:
```haskell
data StackInst
  = AssignRaw RawAssignType RawVar RawExpr  -- RawExpr uses VarAccess unlocated
  | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]
```

---

## Position Information Flow

```
RetCPS (LVarName)
  ↓ [transLVar preserves position]
IR.IRExpr (LVarAccess) ✓
IR.IRTerminator (VarAccess) ❌ POSITION LOST HERE
  ↓ [IR2Raw: unLoc discards position on Tuple/List/Record]
Raw (VarAccess) ❌ POSITION LOST
  ↓ [Workaround: SourcePosAnnotation]
Stack (VarAccess) ❌ POSITION LOST
```

---

## Where Positions Are Discarded

**In `compiler/src/IR2Raw.hs`:**

```haskell
-- Line 468: Tuple loses positions
Tuple (map unLoc lvs)

-- Line 475: List loses positions
List (map unLoc lvs)

-- Line 482: Record loses positions
Record (map (\(f, Loc _ va) -> (f, va)) lfs)

-- Line 495: ListCons head loses position
ListCons (unLoc lv)

-- Line 503: WithRecord fields lose positions
map (\(f, Loc _ va) -> (f, va)) lfs
```

---

## Current Workaround: SourcePosAnnotation

The compiler works around position loss through a special instruction type:

**In `Raw.hs:153-158`:**
```haskell
| SourcePosAnnotation RawVar
   -- | Source position annotation for source map generation.
   -- This instruction generates no code but carries position info that was preserved
   -- when an instruction was eliminated during optimization.
```

**Used in `RawOpt.hs:189-197`:**
```haskell
addSubstWithPos r r' pos =
  if pos == NoPos
  then return []
  else return [Loc pos (SourcePosAnnotation y)]
```

This workaround means positions are **recovered during optimization**, not **preserved in the AST structure**.

---

## Summary Table: Located Type Usage

| IR Stage | Component | Located? | Details |
|----------|-----------|----------|---------|
| RetCPS | SimpleTerm args | ✓ Yes | `LVarName` used consistently |
| IR | IRExpr args | ✓ Yes | `LVarAccess` used consistently |
| IR | IRTerminator args | ❌ No | Plain `VarAccess` |
| IR | Instructions | ✓ Yes | `LIRInst` wrapper |
| IR | Terminators | ✓ Yes | `LIRTerminator` wrapper |
| Raw | RawExpr args | ❌ No | Plain `VarAccess` |
| Raw | RawInst closures | ❌ No | Plain `VarAccess` |
| Raw | Instructions | ✓ Yes | `LRawInst` wrapper |
| Raw | Terminators | ✓ Yes | `LRawTerminator` wrapper |
| Stack | StackInst | ❌ No | Inherits Raw issues |

---

## Recommendations

### Priority 1: Update IRTerminator to use LVarAccess

**File:** `compiler/src/IR.hs`

```haskell
-- Current (loses position)
data IRTerminator
  = TailCall VarAccess VarAccess
  | Ret VarAccess
  | If VarAccess IRBBTree IRBBTree
  ...

-- Recommended (preserves position)
data IRTerminator
  = TailCall LVarAccess LVarAccess
  | Ret LVarAccess
  | If LVarAccess IRBBTree IRBBTree
  ...
```

### Priority 2: Add LVarAccess to Raw IR

**File:** `compiler/src/Raw.hs`

Define Located types:
```haskell
type LRawVarAccess = Located VarAccess
type LRawFields = [(Basics.FieldName, LRawVarAccess)]
```

Update RawExpr:
```haskell
data RawExpr
  = ProjectLVal LRawVarAccess LValField
  | Tuple [LRawVarAccess]
  | List [LRawVarAccess]
  | ListCons LRawVarAccess RawVar
  | Record LRawFields
  | WithRecord RawVar LRawFields
  ...
```

### Priority 3: Update Stack IR

**File:** `compiler/src/Stack.hs`

Apply the same Located types as Raw IR for consistency.

### Priority 4: Update Transformation Passes

**Files affected:**
- `IR2Raw.hs` - Stop discarding positions with `unLoc`
- `Raw2Stack.hs` - Preserve Located wrapper
- `Stack2JS.hs` - Use location info from Located wrapper
- `RawOpt.hs` - May no longer need `SourcePosAnnotation` workaround

---

## Files Requiring Changes

### Type Definition Changes

| File | Changes |
|------|---------|
| `IR.hs` | Add `LVarAccess` to `IRTerminator` |
| `Raw.hs` | Add `LRawVarAccess`, `LRawFields`; update `RawExpr`, `RawInst` |
| `Stack.hs` | Apply same Located types as Raw.hs |

### Transformation Changes

| File | Changes |
|------|---------|
| `IR2Raw.hs` | Preserve `LVarAccess` instead of using `unLoc` |
| `Raw2Stack.hs` | Propagate Located wrappers |
| `Stack2JS.hs` | Extract positions from Located wrappers |
| `RawOpt.hs` | Remove `SourcePosAnnotation` workaround |

---

## Benefits of Refactoring

1. **Consistency**: All AST nodes carry position info at all stages
2. **Correctness**: Runtime errors map to correct source locations
3. **Maintainability**: No need for separate `SourcePosAnnotation` workaround
4. **Type Safety**: Compiler enforces position preservation through types
5. **Source Maps**: Better accuracy without position loss/recovery

---

## Risk Assessment

**Risk Level: LOW**

This is a type-level refactoring. Changes are:
- Localized to type definitions and their consumers
- Caught by Haskell's type system during development
- Testable through existing golden test suite

The existing `SourcePosAnnotation` workaround demonstrates that the infrastructure supports position tracking; this refactoring makes it more principled and consistent.
