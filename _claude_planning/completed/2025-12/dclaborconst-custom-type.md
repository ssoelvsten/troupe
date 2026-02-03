# Task: Replace DCLabOrConst with Custom Type ✅ COMPLETED

## Source
`.experiments/whats-next.md` lines 137-138:
> "For the declaration `type DCLabOrConst = Either LabelExp LabelConst` change it to a new custom type (easier to track than Left/Right)"

## Objective

Replace the type alias `Either LabelExp LabelConst` with a semantic custom type for better code readability and maintainability.

## Background

The current code uses `Either` to represent a label component that can be:
- `Left LabelExp` - A label expression like `alice & bob`
- `Right LabelConst` - A constant (`LabelTrue` or `LabelFalse`)

Using `Left`/`Right` makes the code less readable. A custom type with semantic constructor names is clearer.

---

## Proposed Type

```haskell
data LabelComponent
    = ExprComponent LabelExp      -- A label expression
    | ConstComponent LabelConst   -- A constant (true/false)
    deriving (Eq, Generic, Ord)
```

---

## Files to Modify

### 1. `/compiler/src/DCLabels.hs`

**Line 103 - Type definition:**
```haskell
-- Current:
type DCLabOrConst = Either LabelExp LabelConst

-- Replace with:
data LabelComponent
    = ExprComponent LabelExp
    | ConstComponent LabelConst
    deriving (Eq, Generic, Ord)
```

**Line 105 - Update DCLabelExp:**
```haskell
-- Current:
newtype DCLabelExp =
     DCLabelExp (DCLabOrConst, DCLabOrConst)
        deriving (Eq, Generic, Ord)

-- Replace with:
newtype DCLabelExp =
     DCLabelExp (LabelComponent, LabelComponent)
        deriving (Eq, Generic, Ord)
```

**Lines 114-116 - Update pattern matching in `dcLabelExpToDCLabel`:**
```haskell
-- Current:
    let f e = case e of
                 Left le -> labelExpToCNF le
                 Right lc -> labelConstToCNF lc

-- Replace with:
    let f e = case e of
                 ExprComponent le -> labelExpToCNF le
                 ConstComponent lc -> labelConstToCNF lc
```

**Lines 193-194 - Update pattern matching in `ppMLabelExp`:**
```haskell
-- Current:
          ppMLabelExp (Left e) = ppLabelExp e
          ppMLabelExp (Right s) = text (show s)

-- Replace with:
          ppMLabelExp (ExprComponent e) = ppLabelExp e
          ppMLabelExp (ConstComponent s) = text (show s)
```

**Add Serialize instance (after line 165):**
```haskell
instance Serialize LabelComponent
```

**Update exports (line 12):**
Add `LabelComponent(..)` to the export list.

---

### 2. `/compiler/src/Parser.y`

**Lines 228-231 - Update ConfLabelExp rule:**
```happy
-- Current:
ConfLabelExp :                     { Right LabelTrue }
     | '#root-confidentiality'     { Right LabelFalse }
     | '#null-confidentiality'     { Right LabelTrue }
     | LabelExp                    { Left $1 }

-- Replace with:
ConfLabelExp :                     { ConstComponent LabelTrue }
     | '#root-confidentiality'     { ConstComponent LabelFalse }
     | '#null-confidentiality'     { ConstComponent LabelTrue }
     | LabelExp                    { ExprComponent $1 }
```

**Lines 233-236 - Update IntLabelExp rule:**
```happy
-- Current:
IntLabelExp :                      { Right LabelTrue }
     | '#root-integrity'           { Right LabelFalse }
     | '#null-integrity'           { Right LabelTrue }
     | LabelExp                    { Left $1 }

-- Replace with:
IntLabelExp :                      { ConstComponent LabelTrue }
     | '#root-integrity'           { ConstComponent LabelFalse }
     | '#null-integrity'           { ConstComponent LabelTrue }
     | LabelExp                    { ExprComponent $1 }
```

**Update imports at top of Parser.y:**
Add `LabelComponent(..)` to the DCLabels import.

---

## Verification Steps

1. Build the compiler:
   ```bash
   make compiler
   ```

2. Run the test suite:
   ```bash
   make test
   ```

3. Specifically test DC label parsing:
   ```bash
   bin/golden -p dc
   bin/golden -p dcliterals
   ```

## Notes

- The type is well-contained, only used in DCLabels.hs and Parser.y
- No changes needed to IR.hs, Stack2JS.hs, or other modules that only use `DCLabelExp`
- The serialization should remain compatible since we're just changing constructor names

---

## Completed: 2025-12-27

All changes implemented and verified:
- Replaced `type DCLabOrConst = Either LabelExp LabelConst` with `data LabelComponent`
- Updated pattern matching in `dcLabelExpToDCLabel` and `ppMLabelExp`
- Added `Serialize LabelComponent` instance
- Updated `LabelComponent(..)` to exports
- Updated Parser.y to use `ExprComponent`/`ConstComponent`
- All 42 DC label tests passed
