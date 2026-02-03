# Plan: Improved Error Reporting for Restored Closures

## Problem Statement

When a closure is serialized with `save()` and restored with `restore()`, runtime errors incorrectly show only the call site from the restore file rather than the original source location where the error actually occurs.

**Example:**
- Bug is in `simple-4-save.trp:3` (`f "hi"` where `f x = x+1`)
- Error shows: `simple-4-restore.trp:2:4` (the call site)
- Should indicate: error is in restored code, originally from `simple-4-save.trp:3`

## Root Cause

1. Position info IS serialized inside `FunDef` (in `LIRInst`, `LIRTerminator`, etc.)
2. But in `IR2Raw.hs:864`, deserialization wraps with `Loc NoPos`
3. More importantly, `stack2JSON` (line 310) disables source maps: `cgoSourceMapEnabled = False`
4. Without source maps, the runtime cannot translate JS positions back to original Troupe positions

## Solution Overview

Enable source map generation during deserialization and propagate restoration context so errors can show:
```
Runtime error in thread ...
>> (in restored code)
>> Original source: tests/_unautomated/simple-4-save.trp

  3 | in f "hi"
    |    ^

>> value "hi" is not a number
>> at tests/_unautomated/simple-4-save.trp:3:9
```

---

## Implementation Steps

### Phase 1: Context Indicator (Priority)

Focus on indicating that errors occur in restored code, showing original source file name.

#### Step 1.1: Mark Namespaces as Restored

**File:** `rt/src/deserialize.mts`

Add restoration marker to namespaces after reconstruction (after line 171):
```typescript
ctxt.namespaces[i] = Reflect.construct(NS, argValues);
// NEW: Mark as restored code
Object.defineProperty(ctxt.namespaces[i], '__isRestored', {
    value: true,
    enumerable: false
});
```

#### Step 1.2: Propagate Restoration Flag via currentSourceMap

**File:** `compiler/src/Stack2JS.hs`

Modify the function preamble (line 411) and continuation entry (line 624) to include `__isRestored` in the source map object:
```javascript
// Change from:
_T.currentSourceMap = this.__sourceMap

// To:
_T.currentSourceMap = this.__isRestored
    ? { ...(this.__sourceMap || {}), __isRestored: true }
    : this.__sourceMap
```

This reuses the existing `currentSourceMap` slot without adding new Thread state.

#### Step 1.3: Enhanced Error Display with Restoration Indicator

**File:** `rt/src/TroupeError.mts`

Modify `StopThreadError.handleError` to check `thread.currentSourceMap?.__isRestored`:
```typescript
// After line 344: console.log(chalk.red("Runtime error in thread ..."))
if (this.thread.currentSourceMap?.__isRestored) {
    console.log(chalk.yellow(">> (in restored code)"));
}
```

### Phase 2: Source Map Integration (Future)

Enable source maps during deserialization to show original positions.

#### Step 2.1: Enable Source Maps in `stack2JSON`

**File:** `compiler/src/Stack2JS.hs`

Change line 310 to enable source maps:
```haskell
let opts = CodeGenOpts { cgoDebugMode = debugMode, cgoSourceMapEnabled = True }
```

#### Step 2.2: Extend `JSOutput` with Source Map

**File:** `compiler/src/Stack2JS.hs`

Add `sourceMap` field to `JSOutput` and include it in `stack2JSON` output.

#### Step 2.3: Attach Source Maps to Namespaces

**File:** `rt/src/deserialize.mts`

Extract source map from compiler JSON output and attach to namespace:
```typescript
ctxt.namespaces[i].__sourceMap = snippetJson.sourceMap
```

#### Step 2.4: Use Source Maps for Original Positions

**File:** `rt/src/TroupeError.mts`

Use attached source map to resolve and display original source positions.

---

## Files to Modify

### Phase 1 (Context Indicator)

| File | Changes |
|------|---------|
| `rt/src/deserialize.mts` | Add `__isRestored` to namespaces |
| `compiler/src/Stack2JS.hs` | Include `__isRestored` in `currentSourceMap` |
| `rt/src/TroupeError.mts` | Display "(in restored code)" when flag is set |

### Phase 2 (Source Maps - Future)

| File | Changes |
|------|---------|
| `compiler/src/Stack2JS.hs` | Enable source maps in `stack2JSON`, extend `JSOutput` |
| `rt/src/deserialize.mts` | Attach source maps to namespaces |
| `rt/src/TroupeError.mts` | Use source maps for original positions |

## Testing

Use existing test files `tests/_unautomated/simple-4-save.trp` and `simple-4-restore.trp`:
1. Run save program
2. Run restore program
3. Verify error shows "(in restored code)" indicator

## Expected Output After Phase 1

```
Runtime error in thread ...
>> (in restored code)

  2 | in f_restored ()
    |    ^

>> value "hi" is not a number
>> at tests/_unautomated/simple-4-restore.trp:2:4
```
