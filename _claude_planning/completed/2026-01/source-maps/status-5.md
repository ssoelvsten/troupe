# Source Maps: Phase 16 - Complete Source Position Solution (Revised)

**Date**: 2026-01-03
**Subject**: Unified source maps for static and dynamic code
**Status**: SUPERSEDED BY status-6.md
**Supersedes**: status-4.md

> **Note**: This document is superseded by `status-6.md` which introduces a unified approach
> for both static and dynamic code. Key changes:
> 1. Track `currentSourceMap` on Thread object instead of searching for namespaces
> 2. Every function and continuation sets the source map in its preamble
> 3. Same mechanism works for both static and dynamic code
> 4. Continuation preambles implicitly encode stack discipline for correct source map restoration

**Original Status**: Phase 16a-c COMPLETE, Phase 16d-f PENDING (for dynamic code only)

---

## Key Change from status-4.md

**Memory management for dynamic code source maps**: Instead of using a global `Map<number, SourceMap>` registry (which would leak memory), we attach source maps directly to namespace objects:

```typescript
// OLD (status-4.md) - LEAKS MEMORY
const namespaceSourceMaps = new Map<number, SourceMap>();
namespaceSourceMaps.set(i, mergedMap);

// NEW (status-5.md) - GC-FRIENDLY
Object.defineProperty(nsInstance, '__sourceMap', {
    value: mergedMap,
    enumerable: false,
    writable: false
});
```

This approach:
- **Respects Troupe's GC semantics**: When a namespace is garbage collected, its source map is collected too
- **Is simple**: No separate data structure to maintain
- **Follows existing patterns**: Troupe already embeds metadata (e.g., `.serialized` data)
- **Has no lookup overhead**: Source map is directly on the object

---

## Implementation Status

| Phase | Description                          | Status       |
|-------|--------------------------------------|--------------|
| 16a   | Inline source maps in compiler       | COMPLETE     |
| 16b   | Enable source maps in scripts        | COMPLETE     |
| 16c   | lastCallSourcePos for runtime errors | COMPLETE     |
| 16d   | Extend compiler JSON output          | PENDING      |
| 16e   | Runtime source map merging           | PENDING      |
| 16f   | Runtime stack translation            | PENDING      |

**Note**: Phase 16c provides call-site positions for all runtime errors. Phases 16d-f provide instruction-level precision for dynamic code (the actual error location within the called function).

---

## The Problem: Dynamic Code Error Locations

Consider `simple-4.trp`:

```sml
let fun f_ext () =
     let fun f x = x+1      (* line 2: actual error is here, at the + *)
    in f "hi"               (* line 3: call site *)
    end
    val _ = save (authority, "f_ext", f_ext)
    val f_restored = restore ("f_ext")   (* deserializes and recompiles *)
in f_restored ()            (* line 7: lastCallSourcePos shows this *)
end
```

Currently with Phase 16c (`lastCallSourcePos`), we see line 7 - where `f_restored` is called. But the actual type error is at line 2, column 18 (the `+` operator).

For static code, Node.js `--enable-source-maps` gives us line 2. For dynamic code (restored/deserialized), we need Phases 16d-f.

---

## Part 1: Static Code (COMPLETE)

Uses Node.js native source map support:

1. Compiler embeds inline source map in generated JS
2. `local.sh` and `network.sh` use `--enable-source-maps`
3. Stack traces automatically show Troupe source positions

---

## Part 2: Dynamic Code Solution (PENDING)

### Phase 16d: Extend Compiler JSON Output

**Files**: `compiler/src/Stack2JS.hs`

Extend `JSOutput` to include source maps:

```haskell
data JSOutput = JSOutput
    { libs :: [LibAccess]
    , fname :: Maybe String
    , code :: String
    , atoms :: [Basics.AtomName]
    , sourceMap :: Maybe Value  -- NEW: V3 source map JSON
    } deriving (Show, Generic)
```

JSON output becomes:
```json
{
  "libs": [...],
  "fname": "f23",
  "code": "this.f23 = ($env) => { ... }",
  "atoms": [...],
  "sourceMap": {
    "version": 3,
    "sources": ["original.trp"],
    "mappings": "AAAA,..."
  }
}
```

### Phase 16e: Runtime Source Map Merging

**Files**: `rt/src/deserialize.mts`

Key insight: Multiple functions are concatenated into one code block per namespace. We must:
1. Track line offsets as code is concatenated
2. Merge source maps with adjusted line numbers
3. **Attach merged source map directly to namespace object** (not a global registry)

```typescript
const FUNCTION_WRAPPER_LINES = 2;  // new Function() adds wrapper
const HEADER_LINES = countLines(HEADER);

for (let i = 0; i < serobj.namespaces.length; i++) {
    let ns = serobj.namespaces[i]
    let nsFun = HEADER
    let currentLine = FUNCTION_WRAPPER_LINES + HEADER_LINES;

    const mergedMappings: Mapping[] = [];
    const sources = new Set<string>();

    for (let j = 0; j < ns.length; j++) {
        let snippetJson = JSON.parse(snippets[k++]);

        if (snippetJson.sourceMap) {
            // Adjust line numbers and merge
            const adjusted = adjustSourceMapLines(
                snippetJson.sourceMap,
                currentLine
            );
            mergedMappings.push(...adjusted.mappings);
            adjusted.sources.forEach(s => sources.add(s));
        }

        nsFun += snippetJson.code;
        currentLine += countLines(snippetJson.code);
    }

    // Build merged source map
    const mergedMap = {
        version: 3,
        sources: Array.from(sources),
        mappings: encodeMappings(mergedMappings),
    };

    // Create namespace as before
    let NS = Reflect.construct(Function, [...argNames, nsFun])
    let nsInstance = Reflect.construct(NS, argValues)

    // ATTACH SOURCE MAP DIRECTLY TO NAMESPACE (GC-friendly)
    Object.defineProperty(nsInstance, '__sourceMap', {
        value: mergedMap,
        enumerable: false,  // Don't show in property enumeration
        writable: false
    });

    ctxt.namespaces[i] = nsInstance
}
```

### Phase 16f: Runtime Stack Translation

**Files**: `rt/src/TroupeError.mts` or new `rt/src/SourceMapResolver.mts`

When an error occurs in dynamic code:

```typescript
function translateDynamicStack(error: Error, namespaces: object[]): string {
    const lines = error.stack.split('\n');
    const translated: string[] = [];

    for (const line of lines) {
        // Match: "at Object.f23 (eval at <anonymous> (...), <anonymous>:15:8)"
        const match = line.match(/at (?:Object\.)?(\w+) \(eval.*<anonymous>:(\d+):(\d+)\)/);

        if (match) {
            const [, funcName, lineStr, colStr] = match;
            const jsLine = parseInt(lineStr);
            const jsCol = parseInt(colStr);

            // Find namespace containing this function
            for (const ns of namespaces) {
                if (funcName in ns && ns.__sourceMap) {
                    const original = lookupPosition(ns.__sourceMap, jsLine, jsCol);
                    if (original.source) {
                        translated.push(
                            `    at ${funcName} (${original.source}:${original.line}:${original.column})`
                        );
                        continue;
                    }
                }
            }
        }
        translated.push(line);  // Keep original if can't translate
    }

    return translated.join('\n');
}
```

---

## Why Direct Attachment is the Right Design

### Memory Management

Troupe is carefully designed so that functions and namespaces can be garbage collected when they go out of scope. A global `Map<number, SourceMap>` registry would:
- Hold references to source maps forever
- Prevent garbage collection even when namespaces are no longer reachable
- Grow unbounded in long-running systems with many deserializations

Direct attachment via `Object.defineProperty`:
- Source map lifetime tied to namespace lifetime
- Automatic cleanup when namespace is GC'd
- Zero memory leaks
- Follows JavaScript's natural memory model

### Simplicity

- No separate registry to maintain
- No ID allocation/tracking
- No cleanup code needed
- Source map is where you need it (on the namespace)

### Precedent

Troupe already embeds metadata on objects:
- `.serialized` data in compiled code
- Runtime metadata on various objects

Using `enumerable: false` ensures the property doesn't interfere with user code that might enumerate namespace properties.

---

## Data Flow Summary

### Static Code Path (COMPLETE)
```
source.trp
    | (compiler with -m flag)
    v
source.js + inline source map comment
    | (node --enable-source-maps)
    v
Automatic stack trace translation
```

### Dynamic Code Path (PENDING)
```
Serialized closure (base64 IR)
    | (troupec --json-ir)
    v
JSON with code + sourceMap per function
    | (deserialize.mts)
    v
Merged source map attached to namespace object (nsInstance.__sourceMap)
    | (on error)
    v
Runtime finds namespace, looks up __sourceMap, translates stack
```

---

## Files to Modify

| File                          | Changes                                            |
|-------------------------------|----------------------------------------------------|
| `compiler/src/Stack2JS.hs`    | Add `sourceMap` to `JSOutput`, generate in JSON    |
| `rt/src/deserialize.mts`      | Merge source maps, attach to namespace             |
| `rt/src/TroupeError.mts`      | Translate stack traces using `__sourceMap`         |
| `rt/src/SourceMapResolver.mts`| NEW: Utilities for source map operations           |
| `rt/package.json`             | Move `source-map` to dependencies                  |

---

## Testing Strategy

### Test Case: simple-4.trp

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

**Current output** (Phase 16c): Error at line 7 (call site)
**Expected output** (Phase 16f): Error at line 2, column 18 (the `+`)

### Additional Test Cases

1. **Nested dynamic calls**: Error deep in call stack, verify full translated trace
2. **Multiple namespaces**: Verify each namespace has independent source map
3. **GC test**: Create/discard many closures, verify no memory growth

---

## Implementation Order

1. **Phase 16d**: Compiler JSON output with source maps
2. **Phase 16e**: Runtime merging with direct attachment
3. **Phase 16f**: Stack translation utilities

Each phase can be tested independently before proceeding.

---

## Risks and Mitigations

| Risk                                  | Mitigation                                        |
|---------------------------------------|---------------------------------------------------|
| `__sourceMap` property name collision | Use Symbol instead if needed                      |
| Stack trace format varies by Node     | Test across versions, use robust regex            |
| Source map package overhead           | Only used on error path                           |
| Namespace lookup in error handler     | Maintain context reference during execution       |

---

## Conclusion

This revised design maintains Troupe's careful memory management while providing instruction-level source positions for dynamic code. The key insight is that source maps should follow the same lifecycle as the code they describe - attached directly rather than in a separate registry.
