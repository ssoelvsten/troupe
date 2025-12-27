# Task: Remove Redundant `lubs` Function

**Status: Complete** (2025-12-27)

## Source
`.experiments/whats-next.md` line 119:
> "Get rid of lubs in the runtime codebase, because it is redundant, now that we have a multi-arg lub"

## Objective

Remove the `lubs` function (array-based wrapper) since `lub` already supports multiple arguments via spread syntax.

## Background

The runtime has two ways to compute the least upper bound of security levels:
- `lub(...levels)` - Variadic, takes multiple arguments directly
- `lubs([levels])` - Takes an array

Since `lub` already accepts spread arguments, `lubs` is redundant. The goal is to remove `lubs` and update the single usage site.

---

## Files to Modify

### 1. `/rt/src/RawTuple.mts` (Line 20)

**Current code:**
```typescript
let dataLevels = x.map(lv => lv.dataLevel);
this.dataLevel = levels.lubs.call(null, dataLevels);
```

**Change to:**
```typescript
let dataLevels = x.map(lv => lv.dataLevel);
this.dataLevel = levels.lub(...dataLevels);
```

---

### 2. `/rt/src/AbstractLevel.mts` (Lines 19-21)

**Current code:**
```typescript
export abstract class AbstractLevelSystem <T extends AbstractLevel<T>> {
    abstract BOT : T
    abstract TOP : T
    abstract ROOT : T
    abstract NULL : T
    abstract lub (...ls:T[]) : T
    lubs (ls:T[]) {
        return this.lub(...ls);
    }
    abstract glb (a : T, b: T) : T
    abstract flowsTo (a: T, b: T) : boolean
    abstract actsFor (a: T, b: T) : boolean
}
```

**Remove lines 19-21:**
```typescript
    lubs (ls:T[]) {
        return this.lub(...ls);
    }
```

---

### 3. `/rt/src/Level.mts` (Line 10)

**Current code:**
```typescript
export function lub(...x) { return levels.lub (...x) }
export function lubs(x)   { return levels.lubs (x  ) }
export function glb(a,b)  { return levels.glb (a,b)  }
```

**Remove line 10:**
```typescript
export function lubs(x)   { return levels.lubs (x  ) }
```

---

### 4. `/rt/src/levels/singleton.mts` (Lines 45-48)

**Current code:**
```typescript
export function lubs (x) {
    return __theLevel

}
```

**Remove the entire function (lines 45-48).**

---

## Verification Steps

1. Build the runtime:
   ```bash
   make rt
   ```

2. Run the test suite:
   ```bash
   make test
   ```

3. Verify no TypeScript errors related to `lubs`:
   ```bash
   cd rt && npx tsc --noEmit
   ```

## Notes

- The DCLabels implementation in `/rt/src/levels/DCLabels/dclabel.mts` defines `lub` as a variadic method that already handles arrays via spread
- No other files reference `lubs` in the runtime (verified via grep)
- This is a purely mechanical refactoring with no semantic changes
