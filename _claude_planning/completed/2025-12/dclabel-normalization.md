# Bug: DCLabel.fromSingleTag does not normalize case

## Summary

The `fromSingleTag` function in the DCLabels level system does not lowercase tags, creating an inconsistency with the tagsets level system and potentially causing label equality failures.

## Current Behavior

In `rt/src/levels/DCLabels/dclabel.mts:178-184` (after fix):
```typescript
static fromSingleTag(s: string): DCLabel {
    let labels = new Set([s.trim()]);  // Only trims, no toLowerCase()!
    let cat = new Category(labels);
    let cnf = new CNF(new Set([cat]));
    return new DCLabel(cnf, cnf);
}
```

This means:
```typescript
DCLabel.fromSingleTag("Alice").equals(DCLabel.fromSingleTag("alice"))  // Returns FALSE
```

## Expected Behavior

The function should normalize case like `tagsets.mts:109` does:
```typescript
s.add(t.trim().toLowerCase());  // Correctly lowercases
```

So that:
```typescript
DCLabel.fromSingleTag("Alice").equals(DCLabel.fromSingleTag("alice"))  // Should return TRUE
```

## Impact

**Current severity: Low** because:
- Compile-time label literals are normalized by the lexer (`Lexer.x:161`)
- The `newlabel` builtin uses UUIDs (no case sensitivity issue)
- There's no Troupe builtin to create labels from arbitrary user strings

**However, this should be fixed for:**
1. Code consistency between tagsets and DCLabels
2. Future-proofing if string-to-label conversion is added
3. Internal runtime consistency (e.g., `runtimeMonitored.mts:302` uses `fromSingleTag`)

## Affected Code Paths

- `rt_mkLabel` in `runtimeMonitored.mts:302`
- `fromV1String` in `dclabel.mts:240` (calls `fromSingleTag`)
- `mkV1Level` in `Level.mts:24-26`
- `fromSingleTag` export in `Level.mts:22`

## Fix Applied

In `rt/src/levels/DCLabels/dclabel.mts:180`, changed:
```typescript
let labels = new Set([s.trim()]);
```
to:
```typescript
let labels = new Set([s.trim().toLowerCase()]);
```

Added defensive programming comment and a TODO for potential future performance optimization (skip normalization when frontend already normalized).

## Test File

A test file demonstrating the issue is available at:
`rt/src/_experiments/dclabels_normalization_test.mts`

## Related

- PR #115: Compiler optimizations fix for label equality
- Compiler lexer normalizes labels at parse time: `Lexer.x:161`
- Tagsets correctly normalize: `tagsets.mts:109`
