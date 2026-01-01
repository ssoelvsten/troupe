# Source Provenance Implementation - Handoff Document

## Goal

Implement V3 source maps so all Troupe runtime errors show source location (`filename.trp:LINE:COL`).

**Key Principle**: Modular development - each phase adds functionality without breaking the compiler. The compiler produces valid output at every step.

---

## Key Documents

| Document              | Location                                                                                  | Purpose                |
|-----------------------|-------------------------------------------------------------------------------------------|------------------------|
| Implementation Plan   | `/Users/aslan/.claude/plans/compiled-humming-treehouse.md`                                | Detailed phases        |
| Code Changes          | `_claude_planning/future-migrations-and-improvements/source-provenance-code-changes.md`   | Exact before/after     |
| Summary               | `_claude_planning/future-migrations-and-improvements/missing_source_provenance_errors.md` | Overview               |

---

## Modular Development Overview

| Phase | Changes | Breaks Pipeline? | Test | Status |
|-------|---------|------------------|------|--------|
| 0 | Parser filename | No | Pattern match errors show filename | ✅ DONE |
| 1 | Source map infrastructure | No | Empty .map files generated | ✅ DONE |
| 2 | Stack + PosInf (NoPos default) | No | Infrastructure ready | ✅ DONE |
| 3 | Raw + PosInf (NoPos default) | No | Positions flow Raw→Stack | ✅ DONE |
| 4 | IR + PosInf (NoPos default) | No | Positions flow IR→Raw→Stack | ✅ DONE |
| 5 | Fix optimizations | No | Test with --no-rawopt first | ✅ DONE |
| 6 | Thread from CPS | No | **Source maps populated!** | **NEXT** |
| 7 | Runtime source map resolver | No (runtime only) | Errors show locations | Pending |
| 8 | Error message positions | No | Messages include `at file:line` | Pending |

---

## Root Causes (3 issues being fixed)

### 1. ~~Parser doesn't track filename~~ ✅ FIXED
```haskell
-- BEFORE: compiler/src/Parser.y line 408
pos l = let (AlexPn _ line col) = getPos l
        in SrcPosInf "" line col  -- ← Filename always ""

-- AFTER: Now uses ReaderT monad to thread filename
pos :: L Token -> ReaderT FilePath (Except String) PosInf
pos l = do
    filename <- ask
    let (AlexPn _ line col) = getPos l
    return $ SrcPosInf filename line col
```

### 2. Only 2 IR instructions carry position
```haskell
-- compiler/src/IR.hs - Only these have PosInf:
| Error VarAccess PosInf
| AssertElseError VarAccess IRBBTree VarAccess PosInf
```

### 3. Runtime has no way to show source locations
Runtime errors don't know where in user code they originated.

---

## Libraries Used

### Compiler: `sourcemap` (Haskell)

```haskell
-- hackage.haskell.org/package/sourcemap v0.1.7
import SourceMap (generate)
import SourceMap.Types (SourceMapping(..), Mapping(..), Pos(..))

generate :: SourceMapping -> Value  -- Produces JSON with VLQ encoding
```

### Runtime: `source-map` (npm)

```typescript
// npmjs.com/package/source-map v0.7.4
import { SourceMapConsumer } from 'source-map';

const consumer = await new SourceMapConsumer(mapJson);
const orig = consumer.originalPositionFor({ line, column });
// orig.source = "program.trp", orig.line = 15, orig.column = 3
```

---

## Phase Details

### Phase 0: Parser Filename (Happy's Reader Monad)

```haskell
-- Parser.y
%monad { ReaderT FilePath (Except String) } { (>>=) } { return }

pos :: L Token -> ReaderT FilePath (Except String) PosInf
pos l = do
    filename <- ask
    let (AlexPn _ line col) = getPos l
    return $ SrcPosInf filename line col

parseProg :: FilePath -> String -> Either String Prog
parseProg filename input = runExcept $ do
    tokenStream <- scanTokens input
    runReaderT (prog tokenStream) filename
```

### Phase 1: Infrastructure

- Add `--source-map` flag to Main.hs
- Add `sourcemap >= 0.1.7` to cabal
- Create `TroupeSourceMap.hs` wrapper
- Generate empty `.map` files

### Phases 2-4: Add PosInf to IR Types (Backwards Compatible)

Add `PosInf` to Stack, Raw, IR types with `NoPos` as default:

```haskell
-- Each phase adds PosInf to one layer, passes NoPos initially
-- Phase 2: Stack.hs + Raw2Stack.hs (NoPos) + Stack2JS.hs (collect)
-- Phase 3: Raw.hs + IR2Raw.hs (NoPos) + Raw2Stack.hs (thread)
-- Phase 4: IR.hs + ClosureConv.hs (NoPos) + IR2Raw.hs (thread)
```

### Phase 5: Fix Optimizations

Update pattern matches in IROpt.hs, CPSOpt.hs, RawOpt.hs to preserve positions.

### Phase 6: Thread Real Positions

Extend CCEnv with PosInf, generate real positions in ClosureConv.

### Phase 7: Runtime Source Map Resolver

```typescript
// rt/src/SourceMapResolver.mts (NEW)
import { SourceMapConsumer } from 'source-map';

export async function findUserCodeLocation(compiledJsPath: string): Promise<string | null> {
    // Capture stack trace
    const err = new Error();
    const stack = err.stack || '';

    // Find frame in user's compiled code
    const frameRegex = /at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?/g;
    let match;
    while ((match = frameRegex.exec(stack)) !== null) {
        const [, file, line, col] = match;
        if (file.endsWith('.js') && !file.includes('node_modules')) {
            // Load source map and resolve
            const consumer = await getConsumer(file);
            if (consumer) {
                const orig = consumer.originalPositionFor({
                    line: parseInt(line),
                    column: parseInt(col)
                });
                if (orig.source && orig.line) {
                    return `${orig.source}:${orig.line}:${orig.column ?? 0}`;
                }
            }
        }
    }
    return null;
}
```

```typescript
// rt/src/Thread.mts - Integration
import { findUserCodeLocation } from './SourceMapResolver.mjs';

async threadError(message: string): Promise<never> {
    let fullMessage = message;

    const loc = await findUserCodeLocation(this.compiledJsPath);
    if (loc) {
        fullMessage += `\n | at ${loc}`;
    }

    console.error(`Error: ${fullMessage}`);
    throw new TroupeError(fullMessage);
}
```

### Phase 8: Direct Position Parameters (Optional)

Pass position strings to assertion functions for immediate display:

```typescript
// Asserts.mts
export function assertIsNumber(x: any, pos: string = '') {
    if (typeof x !== 'number') {
        const suffix = pos ? ` at ${pos}` : '';
        _thread().threadError(`value ${pp(x)} is not a number${suffix}`);
    }
}
```

---

## Files to Modify (by Phase)

### Compiler

| Phase | File | Changes |
|-------|------|---------|
| 0 | `compiler/src/Parser.y` | ReaderT monad for filename |
| 0 | `compiler/app/Main.hs` | Pass filename to parser |
| 1 | `compiler/app/Main.hs` | Add `--source-map` flag |
| 1 | `compiler/troupe-compile.cabal` | Add `sourcemap >= 0.1.7` |
| 1 | `compiler/src/TroupeSourceMap.hs` | **NEW** |
| 2 | `compiler/src/Stack.hs` | Add PosInf |
| 2 | `compiler/src/Raw2Stack.hs` | Pass NoPos |
| 2 | `compiler/src/Stack2JS.hs` | Collect mappings |
| 3 | `compiler/src/Raw.hs` | Add PosInf |
| 3 | `compiler/src/IR2Raw.hs` | Pass NoPos |
| 3 | `compiler/src/Raw2Stack.hs` | Thread position |
| 4 | `compiler/src/IR.hs` | Add PosInf |
| 4 | `compiler/src/ClosureConv.hs` | Pass NoPos |
| 4 | `compiler/src/IR2Raw.hs` | Thread position |
| 5 | `compiler/src/IROpt.hs` | Preserve positions |
| 5 | `compiler/src/CPSOpt.hs` | Preserve positions |
| 5 | `compiler/src/RawOpt.hs` | Preserve positions |
| 6 | `compiler/src/ClosureConv.hs` | Thread real positions |

### Runtime

| Phase | File | Changes |
|-------|------|---------|
| 7 | `rt/package.json` | Add `source-map` dependency |
| 7 | `rt/src/SourceMapResolver.mts` | **NEW** |
| 7 | `rt/src/Thread.mts` | Integrate resolver |
| 8 | `rt/src/Asserts.mts` | Add pos parameter |
| 8 | `rt/src/builtins/BuiltinArith.mts` | Add pos parameter |

---

## Build Commands

```bash
make stack      # Build compiler after Haskell changes
make rt         # Build runtime after TypeScript changes
make test       # Run test suite
bin/golden      # Run golden tests
```

---

## Testing Strategy

| Phase | Test |
|-------|------|
| 0 | Pattern match error shows `filename.trp:LINE:COL` |
| 1 | `--source-map` produces valid `.map` file |
| 2-4 | `make test` passes, no regressions |
| 5 | Test with `--no-rawopt` first |
| 6 | `.map` file has real mappings (use online visualizer) |
| 7 | IFC error shows source location |
| 8 | Type error shows `at file:line:col` |

---

## Current Status

**Phase 0 is COMPLETE** (2026-01-01). Parser now tracks filenames correctly.

**Phase 1 is COMPLETE** (2026-01-01). Source map infrastructure in place:
- Added `sourcemap >= 0.1.7` dependency to `package.yaml`
- Created `TroupeSourceMap.hs` wrapper module with `collectMapping`, `buildSourceMap`, `emptySourceMap`
- Added `--source-map` / `-m` flag to compiler
- Compiler generates valid V3 source map JSON files (currently empty mappings)
- All 397 golden tests pass

**Phase 2 is COMPLETE** (2026-01-01). Stack types now carry position info:
- Added `PosInf` field to all `StackInst` variants in `Stack.hs`
- Added `PosInf` field to all `StackTerminator` variants in `Stack.hs`
- Updated `Raw2Stack.hs` to pass `NoPos` for all new position fields
- Updated `Stack2JS.hs` pattern matches to handle new position fields
- Updated pretty printing in `Stack.hs` for new fields
- All 397 golden tests pass

**Phase 3 is COMPLETE** (2026-01-01). Raw types now carry position info:
- Added `PosInf` field to all `RawInst` variants in `Raw.hs`
- Added `PosInf` field to all `RawTerminator` variants in `Raw.hs`
- Updated `IR2Raw.hs` to pass `NoPos` for all new position fields
- Updated `Raw2Stack.hs` to thread positions from Raw to Stack
- Updated `RawOpt.hs` pattern matches to handle new position fields
- Updated `RawDefUse.hs` pattern matches to handle new position fields
- Updated `instructionType` function in `Raw.hs` for new fields
- Updated pretty printing in `Raw.hs` for new fields
- All 397 golden tests pass

**Phase 4 is COMPLETE** (2026-01-01). IR types now carry position info:
- Added `PosInf` field to all `IRInst` variants in `IR.hs` (`Assign`, `MkFunClosures`)
- Added `PosInf` field to remaining `IRTerminator` variants in `IR.hs` (`TailCall`, `Ret`, `If`, `LibExport`, `StackExpand`)
- Updated `ClosureConv.hs` to pass `NoPos` for all new position fields
- Updated `IR2Raw.hs` to thread positions from IR to Raw
- Updated `IROpt.hs` pattern matches in `Substitutable` instances and `trPeval`/`insPeval` functions
- Updated `ComputesDependencies` and `WellFormedIRCheck` instances in `IR.hs`
- Updated pretty printing in `IR.hs` for new fields
- All 397 golden tests pass

**Phase 5 is COMPLETE** (2026-01-01). Optimizations preserve positions:
- Verified `RawOpt.hs` - all `Substitutable` instances and `pevalInst`/`peval` correctly thread positions
- Verified `IROpt.hs` - all `Substitutable` instances and `trPeval`/`insPeval`/`bbPeval` correctly thread positions
- Verified `CPSOpt.hs` - `Substitutable` and `Simplifiable` instances correctly preserve positions on `AssertElseError` and `Error`
- Tested with `--no-rawopt` flag - compiler generates valid output
- All 397 golden tests pass

**Next step**: Phase 6 (Thread from CPS) - extend CCEnv with PosInf, generate real positions in ClosureConv.hs so source maps get populated.

Each subsequent phase can be developed and tested independently.
