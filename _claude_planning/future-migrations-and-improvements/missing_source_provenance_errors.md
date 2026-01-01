# Source Provenance in Error Messages: Implementation Plan

## Executive Summary

**Problem**: Only ~8 of ~40+ error message patterns include source location. Type errors, arithmetic errors, IFC violations, and serialization errors all lack source provenance.

**Solution**: V3 Source Maps using [`sourcemap`](https://hackage.haskell.org/package/sourcemap) Haskell library (compiler) and [`source-map`](https://npmjs.com/package/source-map) npm package (runtime)

**Key Principle**: Modular development - each phase adds functionality without breaking the compiler. The compiler produces valid output at every step.

**Outcome**: All errors will show `filename.trp:LINE:COL` in debuggers and error messages.

---

## 1. Current State

### 1.1 Errors WITH Source Provenance (~8 patterns)

| Error Type                        | Format                    | Example               |
|-----------------------------------|---------------------------|-----------------------|
| Pattern match failure (let)       | `:LINE:COL`               | `at :1:5`             |
| Pattern match failure (function)  | `:LINE:COL`               | `at :2:9`             |
| Pattern match failure (case)      | `:LINE:COL`               | `at :2:23`            |
| Parse errors                      | `LINE:COL`                | `1:33 unexpected token` |
| Duplicate atoms                   | `:LINE:COL and :LINE:COL` | `at :1:18 and :1:28`  |

### 1.2 Errors WITHOUT Source Provenance (~35+ patterns)

| Category                   | Examples                                              |
|----------------------------|-------------------------------------------------------|
| **Type assertions**        | `value () is not a number`, `value 1 is not a string` |
| **Arithmetic**             | `Division by zero error`                              |
| **Serialization**          | `Unserializable object: <basefun:exit>`               |
| **Authorization**          | `Provided authority is not ROOT`                      |
| **IFC - Declassification** | `Not enough authority for declassification`           |
| **IFC - Illegal flow**     | `Illegal flow in adv function`                        |
| **IFC - Mailbox**          | `Not enough mailbox clearance for this receive`       |
| **NMIFC**                  | `NMIFC robustness violation for declassification`     |

---

## 2. Root Causes

### 2.1 Parser doesn't track filename

```haskell
-- Parser.y line 408
pos l = let (AlexPn _ line col) = getPos l
        in SrcPosInf "" line col  -- Filename always ""
```

### 2.2 Only 2 IR instructions carry position

```haskell
-- IR.hs - Only these have PosInf:
| Error VarAccess PosInf
| AssertElseError VarAccess IRBBTree VarAccess PosInf
```

### 2.3 Runtime assertions have no position context

```typescript
// Asserts.mts - No way to know where error occurred
export function assertIsNumber(x: any) {
    if (typeof x !== 'number') {
        _thread().threadError(`value ${pp(x)} is not a number`)
    }
}
```

---

## 3. Solution: V3 Source Maps (Modular Development)

### 3.1 Libraries Used

| Component | Library | Version | Purpose |
|-----------|---------|---------|---------|
| Compiler | [`sourcemap`](https://hackage.haskell.org/package/sourcemap) | >= 0.1.7 | V3 source map generation with VLQ encoding |
| Runtime | [`source-map`](https://npmjs.com/package/source-map) | ^0.7.4 | Parse and resolve source maps |

### 3.2 Modular Phase Structure

| Phase | Changes | Breaks Pipeline? | Test |
|-------|---------|------------------|------|
| 0 | Parser filename (ReaderT) | No | Pattern match errors show filename |
| 1 | Source map infrastructure | No | Empty .map files generated |
| 2 | Stack + PosInf (NoPos default) | No | Infrastructure ready |
| 3 | Raw + PosInf (NoPos default) | No | Positions flow Raw->Stack |
| 4 | IR + PosInf (NoPos default) | No | Positions flow IR->Raw->Stack |
| 5 | Fix optimizations | No | Test with --no-rawopt first |
| 6 | Thread from CPS | No | **Source maps populated!** |
| 7 | Runtime source map resolver | No (runtime only) | Errors show locations |
| 8 | Direct position parameters | No | Messages include `at file:line` |

### 3.3 Output Format

```json
{
  "version": 3,
  "file": "program.js",
  "sources": ["program.trp", "List.trp"],
  "sourcesContent": ["let val x = 10\n...", "..."],
  "names": [],
  "mappings": "AAAA;AACA;AACA,..."
}
```

---

## 4. Implementation Phases

### Phase 0: Fix Filename Tracking (Happy's Reader Monad)

Change parser monad from `Except String` to `ReaderT FilePath (Except String)` so positions include file path.

**Before**: `:15:3`
**After**: `myprogram.trp:15:3`

**Files**: `Parser.y`, `Main.hs`
**Autonomy**: HIGH

### Phase 1: CLI and Infrastructure

Add `--source-map` flag and `sourcemap` library dependency.

**Files**: `Main.hs`, `troupe-compile.cabal`, `TroupeSourceMap.hs` (new)
**Autonomy**: VERY HIGH

### Phases 2-4: Extend IR with Positions (Backwards Compatible)

Add `PosInf` to all IR/Raw/Stack instructions with `NoPos` as default. Thread positions through each layer.

**Files**: `Stack.hs`, `Raw.hs`, `IR.hs`, `Raw2Stack.hs`, `IR2Raw.hs`, `ClosureConv.hs`
**Autonomy**: HIGH

### Phase 5: Preserve Positions in Optimizations

Fix ~15 locations where optimizations create values with `NoPos`.

**Files**: `CPSOpt.hs`, `IROpt.hs`, `RawOpt.hs`
**Autonomy**: HIGH

### Phase 6: Thread Real Positions from CPS

Extend CCEnv with PosInf, generate real positions in ClosureConv.

**Files**: `ClosureConv.hs`, `RetDFCPS.hs`
**Autonomy**: HIGH

### Phase 7: Runtime Source Map Resolver

Create `SourceMapResolver.mts` to parse stack traces and resolve positions using the `source-map` npm package.

```typescript
// rt/src/SourceMapResolver.mts
import { SourceMapConsumer } from 'source-map';

export async function findUserCodeLocation(compiledJsPath: string): Promise<string | null> {
    const err = new Error();
    const stack = err.stack || '';
    // Parse stack frames, find user code, resolve via source map
    // Returns "myprogram.trp:15:3" or null
}
```

**Files**: `rt/package.json`, `SourceMapResolver.mts` (new), `Thread.mts`
**Autonomy**: VERY HIGH

### Phase 8: Direct Position Parameters (Optional)

Pass position strings directly to runtime assertion functions:

```typescript
// Before
rt.assertIsNumber(x);  // Error: "value () is not a number"

// After
rt.assertIsNumber(x, "myprogram.trp:15:3");  // Error: "value () is not a number at myprogram.trp:15:3"
```

**Files**: `Stack2JS.hs`, `Asserts.mts`, `BuiltinArith.mts`
**Autonomy**: VERY HIGH

---

## 5. Error Categories After Implementation

| Error Category         | Before         | After Source Maps              | After Phase 8          |
|------------------------|----------------|--------------------------------|------------------------|
| Pattern match failures | `:LINE:COL`    | Debugger shows file            | Already has position   |
| Type assertions        | No location    | Debugger shows `file:line:col` | Message: `at file:15:3` |
| Division by zero       | No location    | Debugger shows `file:line:col` | Message: `at file:15:3` |
| Serialization          | No location    | Debugger shows `file:line:col` | Message: `at file:15:3` |
| IFC violations         | No location    | Debugger shows `file:line:col` | Message: `at file:15:3` |

**Example error progression:**

| Stage                  | Error Output                                                    |
|------------------------|-----------------------------------------------------------------|
| **Current**            | `value () is not a number`                                      |
| **After Source Maps**  | `value () is not a number` + `\n | at myprogram.trp:15:3`       |
| **After Phase 8**      | `value () is not a number at myprogram.trp:15:3`                |

---

## 6. Files to Modify

### Compiler Changes (Phases 0-6)

| Order | File                              | Changes                                            |
|-------|-----------------------------------|---------------------------------------------------|
| 0     | `compiler/src/Parser.y`           | Thread filename to pos function                    |
| 1     | `compiler/app/Main.hs`            | Pass filename to parser, add `--source-map` flag   |
| 2     | `compiler/troupe-compile.cabal`   | Add `sourcemap >= 0.1.7` dependency                |
| 3     | `compiler/src/TroupeSourceMap.hs` | **NEW** - thin wrapper around `sourcemap` library  |
| 4     | `compiler/src/Stack.hs`           | Add PosInf to StackInst, StackTerminator           |
| 5     | `compiler/src/Raw.hs`             | Add PosInf to RawInst, RawTerminator               |
| 6     | `compiler/src/IR.hs`              | Add PosInf to IRInst, all IRTerminator variants    |
| 7     | `compiler/src/Raw2Stack.hs`       | Thread positions from Raw to Stack                 |
| 8     | `compiler/src/IR2Raw.hs`          | Thread positions from IR to Raw                    |
| 9     | `compiler/src/ClosureConv.hs`     | Thread positions through CC monad                  |
| 10    | `compiler/src/CPSOpt.hs`          | Fix ~6 NoPos locations in constant folding         |
| 11    | `compiler/src/IROpt.hs`           | Fix ~5 NoPos locations in partial evaluation       |
| 12    | `compiler/src/RawOpt.hs`          | Update pattern matches (mostly automatic)          |
| 13    | `compiler/src/Stack2JS.hs`        | Position tracking, mapping collection              |

### Runtime Changes (Phases 7-8)

| Order | File                                   | Changes                            |
|-------|----------------------------------------|------------------------------------|
| 14    | `rt/package.json`                      | Add `source-map ^0.7.4` dependency |
| 15    | `rt/src/SourceMapResolver.mts`         | **NEW** - resolve positions        |
| 16    | `rt/src/Thread.mts`                    | Integrate resolver                 |
| 17    | `rt/src/Asserts.mts`                   | Add position parameter             |
| 18    | `rt/src/builtins/BuiltinArith.mts`     | Add position to division error     |
| 19    | `rt/src/builtins/BuiltinSerialize.mts` | Add position to serialization error|
| 20    | `rt/src/downgrading.mts`               | Add position to IFC errors         |

---

## 7. Autonomy Assessment

| Phase                      | Autonomy      | Notes                                    |
|----------------------------|---------------|------------------------------------------|
| Phase 0 (Filename)         | **HIGH**      | Thread filename through parser           |
| Phase 1 (CLI)              | **VERY HIGH** | Follows existing patterns                |
| Phases 2-4 (IR extension)  | **HIGH**      | Mechanical data type changes, NoPos default |
| Phase 5 (Optimizations)    | **HIGH**      | ~15 specific locations to fix            |
| Phase 6 (Threading)        | **HIGH**      | Pattern: pass PosInf through monad       |
| Phase 7 (Runtime Resolver) | **VERY HIGH** | Independent runtime module               |
| Phase 8 (Direct Positions) | **VERY HIGH** | Simple parameter additions               |

**Overall: HIGH autonomy** - each phase is independent and testable.

---

## 8. Considerations

### 8.1 Remote Code Execution

Troupe supports running code from remote nodes where source may not be available. Solution:
- Position strings (`file:15:3`) are serialized with IR
- Source maps only work when source is local
- Graceful degradation when source unavailable

### 8.2 Library Handling

Pre-compiled libraries need their own source references:
- `myprogram.trp:15:3` - user code
- `List.trp:42:5` - library code

### 8.3 Backward Compatibility

- New runtime handles code without positions (optional parameters with defaults)
- Source maps are optional (`--source-map` flag)
- `NoPos` default ensures compiler works throughout development

---

## 9. Related Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Detailed Code Changes | `source-provenance-code-changes.md` | Exact before/after code |
| Handoff Document | `source-provenance-handoff.md` | Context for new sessions |
| Full Implementation Plan | `/Users/aslan/.claude/plans/compiled-humming-treehouse.md` | Complete plan with all phases |
