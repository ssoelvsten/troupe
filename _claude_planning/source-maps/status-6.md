# Source Maps: Phase 17 - Unified Source Position Solution

**Date**: 2026-01-04
**Subject**: Unified runtime-based source map tracking for static and dynamic code
**Status**: DESIGN COMPLETE, IMPLEMENTATION PENDING
**Supersedes**: status-5.md

---

## Executive Summary

This document describes a **unified approach** to source position tracking that works identically for both static code (compiled `.trp` files) and dynamic code (deserialized closures). Instead of relying on Node.js's `--enable-source-maps` for static code and a separate mechanism for dynamic code, we use a single runtime-based approach:

1. **Source maps attached to namespace objects** (`namespace.__sourceMap`)
2. **Thread tracks current source map** (`$t.currentSourceMap`)
3. **Every function and continuation sets the source map in its preamble**
4. **Runtime translates stack traces** using the tracked source map

This provides consistent error messages regardless of code origin and eliminates the split between static and dynamic code handling.

---

## Key Changes from status-5.md

### Problem with Previous Approach

status-5.md proposed:
- **Static code**: Inline source maps + Node.js `--enable-source-maps`
- **Dynamic code**: Runtime translation with `namespace.__sourceMap`

This created two different mechanisms and left an open question: how does the error handler know which namespace's source map to use?

### Solution: Track Current Source Map on Thread

The runtime already has a `Thread` object (`$t`) that tracks execution state. We add:

```typescript
// On Thread object
$t.currentSourceMap = null;  // Set by function/continuation preambles
```

Every generated function and continuation sets this in its preamble:

```javascript
this.f23 = ($env) => {
    $t.currentSourceMap = this.__sourceMap;
    // ... function body ...
}

const $k42 = ($env) => {
    $t.currentSourceMap = this.__sourceMap;
    // ... continuation body ...
}
```

When an error occurs, `$t.currentSourceMap` points to the correct namespace's source map.

### Why Continuations Must Also Set the Source Map

Consider a call across namespaces:

```
Namespace A: function f calls g (from namespace B)
Namespace B: function g returns to f's continuation $k42
```

Without continuation preamble:
```javascript
// f sets currentSourceMap to A's
this.f23 = ($env) => {
    $t.currentSourceMap = this.__sourceMap;  // A's source map
    g($env_for_g);  // g sets currentSourceMap to B's
}

// When g returns to $k42:
const $k42 = ($env) => {
    // currentSourceMap is STILL B's source map - WRONG!
    // Error here would show wrong source positions
}
```

With continuation preamble:
```javascript
const $k42 = ($env) => {
    $t.currentSourceMap = this.__sourceMap;  // Reset to A's - CORRECT!
    // Error here uses correct source map
}
```

The continuation preamble effectively "restores" the caller's source map context, mirroring how a traditional stack would pop back to the caller's frame. The stack discipline is implicitly encoded in the continuation structure.

---

## Unified Approach: Static and Dynamic Code

### Why Unify?

| Aspect                  | Split approach (status-5)         | Unified approach (status-6)          |
|-------------------------|-----------------------------------|--------------------------------------|
| Static code mechanism   | Node.js `--enable-source-maps`    | Runtime `$t.currentSourceMap`        |
| Dynamic code mechanism  | Runtime `$t.currentSourceMap`     | Runtime `$t.currentSourceMap`        |
| Consistency             | Different error formats           | Identical error formats              |
| Dependencies            | Requires Node.js flag             | Self-contained                       |
| Control                 | Node.js controls formatting       | Full control over error messages     |

### How It Works for Static Code

For static code, the compiler generates a single `Top` namespace:

```javascript
// Generated static code (simplified)
var Top = {};
(function() {
    // Attach source map to Top namespace
    Object.defineProperty(Top, '__sourceMap', {
        value: { version: 3, sources: ['program.trp'], mappings: '...' },
        enumerable: false
    });

    Top.f23 = ($env) => {
        $t.currentSourceMap = Top.__sourceMap;
        // ... function body ...
    };

    Top.$k42 = ($env) => {
        $t.currentSourceMap = Top.__sourceMap;
        // ... continuation body ...
    };
})();
module.exports = Top;
```

### How It Works for Dynamic Code

For dynamic code (deserialized closures), the deserializer:

1. Receives JSON with source maps from compiler
2. Merges source maps as code is concatenated per namespace
3. Attaches merged source map to namespace object
4. Generated code already has preambles (same compiler output)

```typescript
// In deserialize.mts
Object.defineProperty(nsInstance, '__sourceMap', {
    value: mergedSourceMap,
    enumerable: false
});
```

---

## Implementation Details

### Phase 17a: Compiler - Source Map Attachment

**Files**: `compiler/src/Stack2JS.hs`, `compiler/app/Main.hs`

Generate code that attaches source map to the `Top` namespace:

```javascript
// At the start of generated code, after Top = {} declaration
Object.defineProperty(Top, '__sourceMap', {
    value: SOURCE_MAP_JSON,
    enumerable: false
});
```

The source map JSON is the same V3 format currently used for inline source maps, but embedded as a JavaScript object literal instead of base64.

### Phase 17b: Compiler - Preamble Generation

**Files**: `compiler/src/Stack2JS.hs`

Every generated function and continuation gets a preamble:

```haskell
-- Pseudocode for function generation
generateFunction fname body =
    "this." ++ fname ++ " = ($env) => {\n" ++
    "    $t.currentSourceMap = this.__sourceMap;\n" ++  -- NEW PREAMBLE
    body ++
    "};\n"

-- Same for continuations
generateContinuation kname body =
    "const " ++ kname ++ " = ($env) => {\n" ++
    "    $t.currentSourceMap = this.__sourceMap;\n" ++  -- NEW PREAMBLE
    body ++
    "};\n"
```

### Phase 17c: Runtime - Thread Extension

**Files**: `rt/src/Thread.mts`

Add `currentSourceMap` field to Thread:

```typescript
export class Thread {
    // ... existing fields ...

    /**
     * Current source map for the executing code.
     * Set by function/continuation preambles.
     * Used by error handlers to translate JS positions to Troupe positions.
     */
    currentSourceMap: SourceMap | null = null;
}
```

### Phase 17d: Compiler - JSON Output with Source Maps

**Files**: `compiler/src/Stack2JS.hs`

Extend `JSOutput` for `--json-ir` mode:

```haskell
data JSOutput = JSOutput
    { libs :: [LibAccess]
    , fname :: Maybe String
    , code :: String
    , atoms :: [Basics.AtomName]
    , sourceMap :: Maybe Value  -- NEW: V3 source map for this snippet
    } deriving (Show, Generic)
```

### Phase 17e: Runtime - Source Map Merging for Dynamic Code

**Files**: `rt/src/deserialize.mts`

When deserializing, merge source maps as code is concatenated:

```typescript
const FUNCTION_WRAPPER_LINES = 2;  // new Function() adds wrapper lines
const HEADER_LINES = countLines(HEADER);

for (let i = 0; i < serobj.namespaces.length; i++) {
    let ns = serobj.namespaces[i];
    let nsFun = HEADER;
    let currentLine = FUNCTION_WRAPPER_LINES + HEADER_LINES;

    const mergedMappings: Mapping[] = [];
    const allSources: Set<string> = new Set();
    const sourcesContent: Map<string, string> = new Map();

    for (let j = 0; j < ns.length; j++) {
        const snippetJson = JSON.parse(snippets[k++]);

        if (snippetJson.sourceMap) {
            // Adjust line numbers for this snippet's position in merged code
            const adjusted = adjustSourceMapLines(
                snippetJson.sourceMap,
                currentLine
            );
            mergedMappings.push(...adjusted.mappings);
            for (const src of adjusted.sources) {
                allSources.add(src);
            }
            // Merge sourcesContent if present
            if (snippetJson.sourceMap.sourcesContent) {
                snippetJson.sourceMap.sources.forEach((src, idx) => {
                    if (!sourcesContent.has(src)) {
                        sourcesContent.set(src, snippetJson.sourceMap.sourcesContent[idx]);
                    }
                });
            }
        }

        nsFun += snippetJson.code;
        currentLine += countLines(snippetJson.code);
    }

    // Build merged source map
    const mergedMap: SourceMap = {
        version: 3,
        sources: Array.from(allSources),
        sourcesContent: Array.from(allSources).map(s => sourcesContent.get(s) || null),
        mappings: encodeMappings(mergedMappings),
    };

    // Create namespace
    const NS = Reflect.construct(Function, [...argNames, nsFun]);
    const nsInstance = Reflect.construct(NS, argValues);

    // Attach source map (GC-friendly)
    Object.defineProperty(nsInstance, '__sourceMap', {
        value: mergedMap,
        enumerable: false,
        writable: false
    });

    ctxt.namespaces[i] = nsInstance;
}
```

### Phase 17f: Runtime - Stack Trace Translation

**Files**: `rt/src/TroupeError.mts` or new `rt/src/SourceMapResolver.mts`

When an error occurs:

```typescript
import { SourceMapConsumer } from 'source-map';

interface TranslatedPosition {
    source: string | null;
    line: number | null;
    column: number | null;
    name: string | null;
}

/**
 * Look up original position in source map.
 */
async function lookupPosition(
    sourceMap: SourceMap,
    jsLine: number,
    jsColumn: number
): Promise<TranslatedPosition> {
    const consumer = await new SourceMapConsumer(sourceMap);
    try {
        const pos = consumer.originalPositionFor({
            line: jsLine,
            column: jsColumn
        });
        return pos;
    } finally {
        consumer.destroy();
    }
}

/**
 * Translate error using current thread's source map.
 */
async function translateError(
    error: Error,
    thread: Thread
): Promise<string> {
    if (!thread.currentSourceMap) {
        return error.stack || error.message;
    }

    const lines = (error.stack || '').split('\n');
    const translated: string[] = [];

    for (const line of lines) {
        // Match various stack trace formats:
        // Static: "at Top.f23 (/path/to/file.js:15:8)"
        // Dynamic: "at Object.f23 (eval at <anonymous> (...), <anonymous>:15:8)"
        const staticMatch = line.match(/at (?:\w+\.)?(\w+) \([^:]+:(\d+):(\d+)\)/);
        const dynamicMatch = line.match(/at (?:Object\.)?(\w+) \(eval.*<anonymous>:(\d+):(\d+)\)/);

        const match = staticMatch || dynamicMatch;

        if (match) {
            const [, funcName, lineStr, colStr] = match;
            const jsLine = parseInt(lineStr, 10);
            const jsCol = parseInt(colStr, 10);

            const original = await lookupPosition(
                thread.currentSourceMap,
                jsLine,
                jsCol
            );

            if (original.source && original.line !== null) {
                translated.push(
                    `    at ${funcName} (${original.source}:${original.line}:${original.column || 0})`
                );
                continue;
            }
        }

        translated.push(line);  // Keep original if can't translate
    }

    return translated.join('\n');
}
```

### Integration with Error Handling

In the runtime's error handling code:

```typescript
// When catching an error
try {
    // ... execute Troupe code ...
} catch (error) {
    const thread = getCurrentThread();
    const translatedStack = await translateError(error, thread);

    // Display error with translated positions
    console.error(`Error: ${error.message}`);
    console.error(translatedStack);

    // Also include lastCallSourcePos for context
    if (thread.lastCallSourcePos) {
        console.error(`  (called from ${thread.lastCallSourcePos})`);
    }
}
```

---

## Data Flow Diagrams

### Static Code Path

```
source.trp
    |
    | (troupec)
    v
+--------------------------------------------------+
| Generated JS:                                     |
|   Object.defineProperty(Top, '__sourceMap', ...) |
|   Top.f23 = ($env) => {                          |
|       $t.currentSourceMap = this.__sourceMap;    |
|       ...                                        |
|   }                                              |
+--------------------------------------------------+
    |
    | (node executes)
    v
+--------------------------------------------------+
| Runtime:                                          |
|   - Function preamble sets $t.currentSourceMap   |
|   - On error, use $t.currentSourceMap to         |
|     translate JS line:col to Troupe line:col     |
+--------------------------------------------------+
```

### Dynamic Code Path

```
Serialized closure (base64 IR)
    |
    | (troupec --json-ir)
    v
+--------------------------------------------------+
| JSON per function:                                |
|   { code: "...", sourceMap: { ... } }            |
+--------------------------------------------------+
    |
    | (deserialize.mts)
    v
+--------------------------------------------------+
| Per namespace:                                    |
|   - Concatenate function code                    |
|   - Merge source maps with line offsets          |
|   - Attach: nsInstance.__sourceMap = mergedMap   |
+--------------------------------------------------+
    |
    | (execution via new Function())
    v
+--------------------------------------------------+
| Runtime:                                          |
|   - Function preamble sets $t.currentSourceMap   |
|   - On error, use $t.currentSourceMap to         |
|     translate JS line:col to Troupe line:col     |
+--------------------------------------------------+
```

---

## Memory Management

### GC-Friendly Design

Source maps are attached directly to namespace objects:

```typescript
Object.defineProperty(nsInstance, '__sourceMap', {
    value: mergedMap,
    enumerable: false,
    writable: false
});
```

When the namespace is garbage collected, its source map is collected too. No global registries, no memory leaks.

### Thread Reference

`$t.currentSourceMap` holds a reference to the current namespace's source map. This is fine because:

1. The thread is active, so the namespace must still be reachable (functions from it are executing)
2. When execution moves to a different namespace, `currentSourceMap` is updated
3. When the thread terminates, its reference is released

---

## Files to Modify

| File                           | Changes                                                     |
|--------------------------------|-------------------------------------------------------------|
| `compiler/src/Stack2JS.hs`     | Generate preamble in functions/continuations; add sourceMap to JSOutput |
| `compiler/app/Main.hs`         | Generate `Top.__sourceMap` attachment for static code       |
| `rt/src/Thread.mts`            | Add `currentSourceMap` field                                |
| `rt/src/deserialize.mts`       | Merge source maps, attach to namespace                      |
| `rt/src/TroupeError.mts`       | Translate errors using `$t.currentSourceMap`                |
| `rt/src/SourceMapResolver.mts` | NEW: Utilities for source map operations                    |
| `rt/package.json`              | Move `source-map` from devDependencies to dependencies      |
| `local.sh`                     | Can remove `--enable-source-maps` (optional, for consistency) |
| `network.sh`                   | Can remove `--enable-source-maps` (optional, for consistency) |

---

## Implementation Phases

### Phase 17a: Runtime Thread Extension

1. Add `currentSourceMap` field to Thread
2. Add `SourceMapResolver.mts` with translation utilities
3. Move `source-map` from devDependencies to dependencies in `rt/package.json`

### Phase 17b: Error Translation Integration

1. Integrate source map translation into error handling code
2. Use `$t.currentSourceMap` when available to translate stack traces

### Phase 17c: Compiler - Preamble Generation

1. Generate preamble `$t.currentSourceMap = this.__sourceMap` in all functions/continuations
2. Generate `Top.__sourceMap` attachment for static code
3. **Test**: Static code errors should now show Troupe source positions

### Phase 17d: Compiler - JSON Output with Source Maps

1. Extend `JSOutput` with `sourceMap` field for `--json-ir` mode
2. Generate source maps for each JSON snippet

### Phase 17e: Runtime - Source Map Merging for Dynamic Code

1. Parse source maps from compiler JSON output
2. Merge source maps as code is concatenated per namespace
3. Attach merged source map to namespace object
4. **Test**: Dynamic code errors (save/restore like simple-4.trp) should show Troupe source positions

### Phase 17f: Polish and Testing

1. Robust stack trace parsing for various Node.js versions
2. Comprehensive test suite (static, dynamic, cross-namespace)
3. Optional: Remove `--enable-source-maps` from scripts for consistency

---

## Testing Strategy

### Test Case 1: Static Code Error

```sml
(* test_static_error.trp *)
let fun f x = x + 1
 in f "hi"
 end
```

**Expected**: Error points to line 1, column 15 (the `+`)

### Test Case 2: Dynamic Code Error (simple-4.trp)

```sml
let fun f_ext () =
     let fun f x = x+1
    in f "hi"
    end
    val _ = save (authority, "f_ext", f_ext)
    val f_restored = restore ("f_ext")
in f_restored ()
end
```

**Expected**: Error points to line 2, column 18 (the `+` inside restored code)

### Test Case 3: Cross-Namespace Calls

```sml
(* Test that continuation correctly restores source map after cross-namespace call *)
let fun outer () =
    let val inner = restore ("inner_func")  (* from different namespace *)
     in inner ();
        1 + "error"  (* error after returning from inner *)
    end
 in outer ()
 end
```

**Expected**: Error points to the `+` in outer, not somewhere in inner's namespace

### Test Case 4: Nested Dynamic Calls

Error deep in call stack through multiple namespaces, verify translated trace shows all Troupe positions.

### Test Case 5: GC Test

Create and discard many closures, verify no memory growth from source maps.

---

## Comparison with Previous Approaches

### vs. status-4.md (Global Registry)

| Aspect          | status-4 (registry)              | status-6 (attached + thread)      |
|-----------------|----------------------------------|-----------------------------------|
| Memory          | Leaks (registry holds forever)   | GC-friendly (attached to object)  |
| Lookup          | Search registry by namespace ID  | Direct via `$t.currentSourceMap`  |
| Complexity      | Registry management needed       | Simple, follows execution flow    |

### vs. status-5.md (Separate Static/Dynamic)

| Aspect          | status-5 (split)                 | status-6 (unified)                |
|-----------------|----------------------------------|-----------------------------------|
| Static code     | Node.js `--enable-source-maps`   | Runtime translation               |
| Dynamic code    | Runtime translation              | Runtime translation               |
| Consistency     | Different mechanisms             | Single mechanism                  |
| Error format    | Different formats                | Consistent format                 |
| Dependencies    | Node.js flag required            | Self-contained                    |

### vs. Frame-Based Tracking

| Aspect          | Frame modification               | Thread field + preamble           |
|-----------------|----------------------------------|-----------------------------------|
| Changes needed  | Frame layout, all offset refs    | Preamble generation only          |
| Stack trace     | Full Troupe-level stack possible | Innermost function, JS stack      |
| Complexity      | High (touches many places)       | Low (localized changes)           |

---

## Risks and Mitigations

| Risk                                      | Mitigation                                           |
|-------------------------------------------|------------------------------------------------------|
| Preamble adds overhead to every call      | Single assignment, negligible cost                   |
| Stack trace format varies by Node version | Test across versions, use robust regex patterns      |
| `source-map` package is async             | Cache SourceMapConsumer or use sync alternative      |
| `__sourceMap` property name collision     | Use Symbol if collision detected                     |
| Continuations in different contexts       | Preamble ensures correct source map on every entry   |

---

## Future Enhancements

1. **Full Troupe Stack Traces**: If needed later, can extend to track source map in each frame for complete translated stack traces.

2. **Source Content Embedding**: Include original Troupe source in source maps for display without file access.

3. **Source Map Caching**: Cache parsed source maps to avoid re-parsing on repeated errors.

4. **Debug Mode**: Optional verbose mode that shows both JS and Troupe positions.

---

## Conclusion

This unified approach provides:

- **Consistency**: Same mechanism for static and dynamic code
- **Correctness**: Continuation preambles ensure correct source map after cross-namespace calls
- **Simplicity**: Single field on Thread, preamble in generated code
- **GC-Friendly**: Source maps attached to objects, collected when objects are collected
- **Self-Contained**: No dependency on Node.js `--enable-source-maps` flag

The key insight is that the continuation-based execution model naturally supports stack-like source map tracking - each continuation "restores" its namespace's source map in its preamble, just as a traditional return would restore the caller's stack frame.
