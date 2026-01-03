# Source Maps: Phase 15 - Runtime Position Extraction via Compiler

> **SUPERSEDED**: This document has been superseded by [status-3.md](status-3.md) which proposes inline source maps as a unified solution. Phase 15's approach of embedding `.sourcePos` on functions only provides function-level positions, not instruction-level precision. Inline source maps provide instruction-level precision AND work for dynamic code. See status-3.md for the complete solution.

**Date**: 2026-01-03
**Subject**: Unified approach for source positions in all error messages

---

## Executive Summary

This document proposes a unified approach to include Troupe source positions in runtime error messages that works for both:
1. Statically compiled code (loaded from `.js` files)
2. Dynamically received/deserialized code (via `receive`, `restore`, etc.)

The key insight is that the Haskell compiler is **already running as a subprocess** during deserialization, so we can extend its JSON output to include position information rather than trying to parse the binary serialization format in TypeScript.

---

## Background: Why Source Maps Alone Are Insufficient

### The Dynamic Code Problem

Phase 14's source map approach works for statically compiled code:
```
source.trp  →  troupec -m  →  source.js + source.js.map
```

However, Troupe supports dynamic code execution:

1. **Serialization**: Closures can be serialized and sent over the network
2. **Deserialization**: Received closures are reconstructed at runtime using the compiler
3. **No .js file**: Dynamically deserialized code is constructed in memory via `Function` constructor

From `rt/src/deserialize.mts` lines 160-171:
```typescript
// Code is constructed dynamically - no .js file exists
let NS: any = Reflect.construct(Function, argNames)
ctxt.namespaces[i] = Reflect.construct(NS, argValues)
```

There is no `.js` file on disk for dynamically received code, so traditional source maps don't apply.

---

## Current Architecture Deep Dive

### How Closures Are Serialized

In `rt/src/serialize.mts`, closures are serialized by walking the value graph:

```typescript
// Lines 95-160 in serialize.mts
case Ty.TroupeType.CLOSURE:
    // ...
    namespace.set(ff, x.fun.serialized)  // Line 143
    // ...
    dfs(x.fun.deps);  // Recursively include dependencies
```

Each function has a `.serialized` field containing Base64-encoded binary data.

### What's in the Serialized Binary

The serialization uses Haskell's `Data.Serialize` library. From `compiler/src/IR.hs`:

```haskell
-- Lines 136-144
data FunDef = FunDef
    HFN         -- name of the function (e.g., "f23")
    VarName     -- name of the argument (e.g., "f_arg124")
    PosInf      -- source position of the argument  ← POSITION INFO
    Consts      -- constants used in the function
    IRBBTree    -- body (contains Located wrappers with more positions)

-- Lines 25-28 in TroupePositionInfo.hs
data PosInf = SrcPosInf String Int Int   -- filename, line, column
            | RTGen String                -- runtime-generated (no source)
            | NoPos                       -- no position info
```

The binary format for a simple function like `fun f x = x + 1`:
```
Offset   Hex                              Meaning
00000000 0000 0000 0000 0000 03           Tag + length prefix
00000009 66 32 33                         "f23" (function name)
00000020 ...
00000020 1f 74 65 73 74 73 2f 5f ...      "tests/_unautomated/simple-1.trp"
00000040 00 01                            line: 1
00000048 00 0b                            column: 11
```

### How Deserialization Works

The deserializer in `rt/src/deserialize.mts` works as follows:

1. **Compiler subprocess is started** (line 43-50):
```typescript
function startCompiler() {
    __compilerOsProcess = spawn(getTroupeRoot() + '/bin/troupec', ['--json-ir']);
    // ...
}
```

2. **Serialized IR is sent to compiler** (lines 327-337):
```typescript
for (let j = 0; j < ns.length; j++) {
    __compilerOsProcess.stdin.write(ns[j][1]);  // ns[j][1] is the Base64 IR
    __compilerOsProcess.stdin.write("\n")
}
__compilerOsProcess.stdin.write("!ECHO /*-----*/\n")  // Marker
```

3. **Compiler outputs JSON** (handled in lines 60-67):
```typescript
__compilerOsProcess.stdout.on('data', (data: string) => {
    accum += data;
    let j = accum.indexOf(marker);
    if (j >= 0) {
        constructCurrent(accum.slice(0, j));
        accum = accum.slice(j + marker.length);
    }
});
```

4. **JSON is parsed and code is constructed** (lines 107-173):
```typescript
function constructCurrent(compilerOutput: string) {
    let snippets = compilerOutput.split("\n\n");
    // ...
    for (let j = 0; j < ns.length; j++) {
        let snippetJson = JSON.parse(snippets[k++]);
        nsFun += snippetJson.code;  // JavaScript code string
        // snippetJson also has: libs, fname, atoms
    }
    // ...
    let NS: any = Reflect.construct(Function, argNames)
    ctxt.namespaces[i] = Reflect.construct(NS, argValues)
}
```

### Current Compiler JSON Output

From `compiler/src/Stack2JS.hs` lines 80-86:
```haskell
data JSOutput = JSOutput
    { libs  :: [LibAccess]
    , fname :: Maybe String
    , code  :: String
    , atoms :: [Basics.AtomName]
    } deriving (Show, Generic)

instance Aeson.ToJSON JSOutput
```

The `stack2JSON` function (lines 286-296):
```haskell
stack2JSON :: CompileMode -> Bool -> StackUnit -> ByteString
stack2JSON compileMode debugMode su =
  let (ppDoc, (libs, atoms, konts, _markers)) = stack2PPDoc compileMode debugMode su
      fname = case su of
          FunStackUnit (Loc _ (FunDef (HFN n) _ _ _ _)) -> Just n
          AtomStackUnit _ -> Nothing
          ProgramStackUnit _ -> error "..."
  in Aeson.encode $ JSOutput { libs = libs
                             , fname = fname
                             , atoms = atoms
                             , code = PP.render ppDoc
                             }
```

**Key observation**: The `Loc _ (FunDef ...)` pattern discards the position (`_`), but it's available!

---

## Proposed Solution: Extend Compiler JSON Output

### Step 1: Add Position to JSOutput

In `compiler/src/Stack2JS.hs`:

```haskell
-- Add new data type for JSON-serializable position
data SourcePosJSON = SourcePosJSON
    { spFile   :: String
    , spLine   :: Int
    , spColumn :: Int
    } deriving (Show, Generic)

instance Aeson.ToJSON SourcePosJSON where
    toJSON (SourcePosJSON f l c) = Aeson.object
        [ "file"   Aeson..= f
        , "line"   Aeson..= l
        , "column" Aeson..= c
        ]

-- Modify JSOutput to include position
data JSOutput = JSOutput
    { libs      :: [LibAccess]
    , fname     :: Maybe String
    , code      :: String
    , atoms     :: [Basics.AtomName]
    , sourcePos :: Maybe SourcePosJSON  -- NEW FIELD
    } deriving (Show, Generic)

-- Helper to convert PosInf to JSON representation
posToJSON :: PosInf -> Maybe SourcePosJSON
posToJSON (SrcPosInf file line col) = Just $ SourcePosJSON file line col
posToJSON (RTGen _) = Nothing
posToJSON NoPos = Nothing
```

### Step 2: Extract Position in stack2JSON

```haskell
stack2JSON :: CompileMode -> Bool -> StackUnit -> ByteString
stack2JSON compileMode debugMode su =
  let (ppDoc, (libs, atoms, konts, _markers)) = stack2PPDoc compileMode debugMode su
      (fname, pos) = case su of
          FunStackUnit (Loc defPos (FunDef (HFN n) _ argPos _ _)) ->
              -- Use the Located wrapper's position (function definition site)
              -- Could also use argPos for argument position
              (Just n, posToJSON defPos)
          AtomStackUnit _ ->
              (Nothing, Nothing)
          ProgramStackUnit _ ->
              error "Internal error: stack2JSON called with ProgramStackUnit"
  in Aeson.encode $ JSOutput
        { libs = libs
        , fname = fname
        , atoms = atoms
        , code = PP.render ppDoc
        , sourcePos = pos  -- NEW
        }
```

### Step 3: Add Position to Generated JavaScript

For statically compiled code, we also want `.sourcePos` on functions. In `Stack2JS.hs`, the `toJS` instance for `LFunDef` (around line 380-400):

Current code:
```haskell
instance ToJS LFunDef where
  toJS lfdecl@(Loc pos irfdef@(FunDef hfn arg argPos consts bb)) = do
    -- ... generates:
    -- this.f23 = ($env) => { ... }
    -- this.f23.deps = [...]
    -- this.f23.libdeps = [...]
    -- this.f23.serialized = "..."
    -- this.f23.framesize = N
```

Add after framesize:
```haskell
    -- Add source position property
    let posDoc = case pos of
          SrcPosInf file line col ->
            semi $ text "this." PP.<> ppId hfn PP.<> text ".sourcePos = "
                   PP.<> ppPosObject file line col
          _ -> PP.empty

    return $ vcat [ {- existing code -}, posDoc ]

-- Helper to generate { file: "...", line: N, column: N }
ppPosObject :: String -> Int -> Int -> PP.Doc
ppPosObject file line col =
    PP.braces $ PP.hsep $ PP.punctuate PP.comma
        [ text "file:" <+> PP.doubleQuotes (text file)
        , text "line:" <+> PP.int line
        , text "column:" <+> PP.int col
        ]
```

This would generate:
```javascript
this.f23.deps = [];
this.f23.libdeps = [];
this.f23.serialized = "...";
this.f23.framesize = 0;
this.f23.sourcePos = {file: "tests/_unautomated/simple-1.trp", line: 1, column: 9};
```

---

## Runtime Changes

### Step 4: Parse Position in Deserializer

In `rt/src/deserialize.mts`, modify `constructCurrent`:

```typescript
function constructCurrent(compilerOutput: string) {
    // ... existing setup ...

    // Map to store positions for each function name
    const positionMaps: Map<string, {file: string, line: number, column: number}>[] = [];

    for (let i = 0; i < serobj.namespaces.length; i++) {
        let ns = serobj.namespaces[i]
        let nsFun = HEADER
        let atomSet = new Set<string>()
        const posMap = new Map<string, {file: string, line: number, column: number}>();

        for (let j = 0; j < ns.length; j++) {
            if (j > 0) {
                nsFun += "\n\n"
            }
            let snippetJson = JSON.parse(snippets[k++]);
            nsFun += snippetJson.code;

            for (let atom of snippetJson.atoms) {
                atomSet.add(atom)
            }

            // NEW: Store position if available
            if (snippetJson.sourcePos && snippetJson.fname) {
                posMap.set(snippetJson.fname, snippetJson.sourcePos);
            }
        }

        positionMaps.push(posMap);

        // ... existing namespace construction ...
        let NS: any = Reflect.construct(Function, argNames)
        ctxt.namespaces[i] = Reflect.construct(NS, argValues)

        // NEW: Attach positions to functions after construction
        for (const [fname, pos] of posMap) {
            if (ctxt.namespaces[i][fname]) {
                ctxt.namespaces[i][fname].sourcePos = pos;
            }
        }
    }

    // ... rest of existing code ...
}
```

### Step 5: Create Position Extraction Utility

Create new file `rt/src/SourcePosition.mts`:

```typescript
/**
 * Utilities for extracting Troupe source positions from runtime state
 */

export interface SourcePos {
    file: string;
    line: number;
    column: number;
}

/**
 * Parse a JavaScript Error stack trace and extract function names
 * that belong to Troupe-generated code (Top.* functions)
 */
export function parseTroupeFunctions(stack: string): string[] {
    const functions: string[] = [];
    const lines = stack.split('\n');

    for (const line of lines) {
        // Match patterns like:
        // "    at Top.f23 (/path/to/file.js:15:8)"
        // "    at Top.$$$main$$$kont5 (/path/to/file.js:200:5)"
        const match = line.match(/at\s+Top\.(\w+)\s+\(/);
        if (match) {
            functions.push(match[1]);
        }
    }

    return functions;
}

/**
 * Given a namespace object (Top instance) and a list of function names,
 * extract source positions for those functions that have them
 */
export function getPositionsFromNamespace(
    namespace: any,
    functionNames: string[]
): SourcePos[] {
    const positions: SourcePos[] = [];

    for (const fname of functionNames) {
        const func = namespace?.[fname];
        if (func?.sourcePos) {
            positions.push(func.sourcePos);
        }
    }

    return positions;
}

/**
 * Format source positions as a stack trace string
 */
export function formatTroupeStack(positions: SourcePos[]): string {
    if (positions.length === 0) {
        return '';
    }

    const lines = positions.map(pos =>
        `  at ${pos.file}:${pos.line}:${pos.column}`
    );

    return 'Troupe stack trace:\n' + lines.join('\n');
}

/**
 * Get the first (innermost) source position from an error
 */
export function getErrorPosition(
    error: Error,
    namespace: any
): SourcePos | null {
    const stack = error.stack || '';
    const functions = parseTroupeFunctions(stack);
    const positions = getPositionsFromNamespace(namespace, functions);
    return positions[0] || null;
}
```

### Step 6: Access Namespace at Error Time

The challenge is accessing the namespace when an error occurs. Options:

**Option A: Store namespace reference on Thread**

In `rt/src/Thread.mts`, add a field:
```typescript
class Thread {
    // ... existing fields ...
    currentNamespace: any = null;  // Set when entering a Troupe function
}
```

Modify generated code to set this:
```javascript
this.f23 = ($env) => {
    let _T = rt.runtime.$t
    _T.currentNamespace = this;  // NEW: track current namespace
    // ... rest of function ...
}
```

**Option B: Parse namespace from closure in call stack**

The Troupe call stack contains return continuations. Each continuation is a closure that has access to the namespace via its `this` binding.

In `rt/src/Thread.mts`, the `callStack` structure:
```
[sp_prev, pc_ret, ret_callback, mclear, branch_flag, ...]
          ^^^^^^^^^^^^^^
          ret_callback is a bound function like this.$$$main$$$kont5
```

We could potentially access `ret_callback.namespace` if we store it.

**Option C: Capture namespace when throwing error**

Modify `Asserts.mts` to capture namespace:
```typescript
function _thread() {
    return getRuntimeObject().__sched.__currentThread
}

export function rawAssertIsNumber(x) {
    if (typeof x != 'number') {
        const error = new Error();
        const thread = _thread();
        // thread.currentNamespace would have the namespace
        err("value " + __stringRep(x) + " is not a number", error, thread.currentNamespace)
    }
}
```

**Recommended**: Option A (store on Thread) is cleanest and most reliable.

### Step 7: Modify Error Display

In `rt/src/TroupeError.mts`:

```typescript
import { parseTroupeFunctions, getPositionsFromNamespace, formatTroupeStack } from './SourcePosition.mjs';

export abstract class StopThreadError extends ThreadError {
    abstract explainstr: string;

    // Store the error for stack trace extraction
    jsError: Error;

    constructor(thread: Thread) {
        super(thread);
        this.jsError = new Error();  // Capture stack at construction
    }

    handleError(sched) {
        let console = this.thread.rtObj.xconsole;
        console.log(chalk.red("Runtime error in thread " + this.thread.tidErrorStringRep()));
        console.log(chalk.red(">> " + this.errorMessage));

        // NEW: Show Troupe stack trace
        const namespace = this.thread.currentNamespace;
        if (namespace && this.jsError.stack) {
            const functions = parseTroupeFunctions(this.jsError.stack);
            const positions = getPositionsFromNamespace(namespace, functions);
            const stackStr = formatTroupeStack(positions);
            if (stackStr) {
                console.log(chalk.yellow(stackStr));
            }
        }

        if (getCliArgs()[TroupeCliArg.Explain] && this.explainstr) {
            console.log(chalk.yellow(this.explainstr));
        }
        sched.stopThreadWithErrorMessage(this.thread, this.errorMessage);
    }
}
```

---

## Expected Output

Before:
```
Runtime error in thread e32bd8bb-8f82-4a80-8c3c-7fb8f45d6063@{}%{}
>> value "hi" is not a number
```

After:
```
Runtime error in thread e32bd8bb-8f82-4a80-8c3c-7fb8f45d6063@{}%{}
>> value "hi" is not a number
Troupe stack trace:
  at tests/_unautomated/simple-1.trp:1:15
  at tests/_unautomated/simple-1.trp:2:4
```

---

## Test Cases

### Test 1: Static Compilation (simple-1.trp)

```sml
let fun f x = x + 1
 in f "hi"
 end
```

Expected: Error at line 1 (the `+` operation) with stack showing call from line 2.

### Test 2: Nested Function Calls

```sml
let fun g y = y + 1
    fun f x = g x
 in f "hi"
 end
```

Expected: Error at line 1 (in `g`), stack shows `g` called from `f` (line 2), `f` called from line 3.

### Test 3: Dynamic Code (requires multi-node or simulation)

Send a closure over the network and execute it. Verify that position info is preserved.

---

## Implementation Checklist

### Phase 15a: Compiler Changes
- [ ] Add `SourcePosJSON` data type to `Stack2JS.hs`
- [ ] Add `sourcePos` field to `JSOutput`
- [ ] Implement `posToJSON` helper
- [ ] Modify `stack2JSON` to extract and include position
- [ ] Modify `toJS` for `LFunDef` to emit `.sourcePos` property
- [ ] Test: Compile simple program, verify JSON output contains position
- [ ] Test: Compile simple program, verify `.js` file has `.sourcePos` properties

### Phase 15b: Deserializer Changes
- [ ] Modify `constructCurrent` to parse `sourcePos` from JSON
- [ ] Store position map during namespace construction
- [ ] Attach positions to functions after construction
- [ ] Test: Deserialize a closure, verify `.sourcePos` is present

### Phase 15c: Thread Changes
- [ ] Add `currentNamespace` field to Thread class
- [ ] Modify generated code to set `currentNamespace` on function entry
- [ ] Consider: Reset on function exit? (May not be necessary)

### Phase 15d: Error Handling Changes
- [ ] Create `SourcePosition.mts` with utility functions
- [ ] Modify `StopThreadError` to capture Error at construction
- [ ] Modify `handleError` to extract and display Troupe stack
- [ ] Test: Trigger error, verify stack trace shows correct positions

### Phase 15e: Integration Testing
- [ ] Run existing test suite, verify no regressions
- [ ] Test various error types (type errors, IFC errors, etc.)
- [ ] Test with deserialized code if possible

---

## Files to Modify (Complete List)

| File | Changes |
|------|---------|
| `compiler/src/Stack2JS.hs` | Add `SourcePosJSON`, modify `JSOutput`, modify `stack2JSON`, modify `toJS` for `LFunDef` |
| `rt/src/deserialize.mts` | Parse `sourcePos` from JSON, attach to functions |
| `rt/src/Thread.mts` | Add `currentNamespace` field |
| `rt/src/SourcePosition.mts` | NEW FILE: Position extraction utilities |
| `rt/src/TroupeError.mts` | Capture Error, display Troupe stack trace |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Generated code size increases | `.sourcePos` is small (~50 bytes per function), acceptable |
| Performance impact | Position only accessed on error, no hot path impact |
| Namespace access complexity | Option A (Thread field) is straightforward |
| Breaking serialization format | No change to serialization - only adds runtime property |

---

## Comparison with Phase 14 (Source Maps)

| Aspect | Phase 14 (Source Maps) | Phase 15 (Compiler JSON) |
|--------|------------------------|--------------------------|
| Static code | ✓ Works | ✓ Works |
| Dynamic code | ✗ No .map file | ✓ Works |
| Implementation | Moderate | Moderate |
| Runtime overhead | Low (parse on error) | Low (store on load) |
| Accuracy | JS line → Troupe line | Direct Troupe position |
| Coverage | ~60-70% (assertions only) | 100% (all errors) |
| External files | Requires .map files | Self-contained |

**Recommendation**: Phase 15 supersedes Phase 14. Implement Phase 15 only.

---

## Future Enhancements

1. **Per-instruction positions**: Currently we get function-level positions. Could extend to track positions of individual IR instructions for more precise error locations.

2. **Source snippets**: With file path and line number, could show the actual source code line in error messages.

3. **IDE integration**: Position info could be used for debugging, breakpoints, etc.

---

**Status**: Design complete, ready for implementation
**Confidence**: High - builds on existing, proven infrastructure
**Risk**: Low - incremental changes to well-understood code paths
