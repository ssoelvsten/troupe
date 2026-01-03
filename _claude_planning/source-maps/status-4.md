# Source Maps: Phase 16 - Complete Source Position Solution

**Date**: 2026-01-03
**Subject**: Unified source maps for static and dynamic code
**Status**: Phase 16a-b COMPLETE, Phase 16c-f PENDING

---

## Implementation Status

| Phase | Description                          | Status       |
|-------|--------------------------------------|--------------|
| 16a   | Inline source maps in compiler       | ✅ COMPLETE  |
| 16b   | Enable source maps in scripts        | ✅ COMPLETE  |
| 16c   | Extend compiler JSON output          | ⏳ PENDING   |
| 16d   | Runtime source map merging           | ⏳ PENDING   |
| 16e   | Runtime stack translation            | ⏳ PENDING   |
| 16f   | Source map library                   | ⏳ PENDING   |

---

## Executive Summary

This document describes a complete solution for showing Troupe source positions in runtime error messages. The solution has two parts:

1. **Static code** (compiled `.trp` → `.js` files): Use inline source maps with Node.js's native `--enable-source-maps` flag
2. **Dynamic code** (deserialized closures via `Function` constructor): Extend compiler JSON output to include source maps, merge them at namespace construction, and translate stack traces at runtime

Both approaches use the same underlying source map infrastructure (V3 source maps) and provide instruction-level precision.

---

## Background: Two Types of Code Execution

### Static Code

When you run `./local.sh program.trp`:
1. Compiler generates `program.js` (written to a temp file)
2. Node.js loads and executes the file
3. Stack traces reference the `.js` file with line/column numbers

For static code, Node.js's `--enable-source-maps` flag automatically translates stack traces if the JS file contains a `//# sourceMappingURL` comment pointing to a source map.

### Dynamic Code

When closures are serialized and sent over the network:
1. Receiving node deserializes the closure
2. Compiler subprocess (`troupec --json-ir`) reconstructs the code
3. Code is executed via `new Function(...)` constructor
4. Stack traces show `<anonymous>` with line numbers in the dynamically constructed code

**Critical limitation**: Node.js's `--enable-source-maps` does NOT work with dynamically constructed functions. The `//# sourceMappingURL` comment inside a `Function` constructor body is completely ignored.

---

## Part 1: Static Code Solution

### How It Works

1. **Compiler embeds inline source map** in generated JS:
   ```javascript
   // ... generated code ...
   module.exports = Top
   //# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLC...
   ```

2. **Node.js is invoked with `--enable-source-maps`**

3. **Stack traces are automatically translated**:
   ```
   // Without source maps:
   at Top.f23 (/tmp/program.js:15:8)

   // With source maps:
   at Top.f23 (/path/to/program.trp:1:15)
   ```

### Proof of Concept

Tested with `simple-1.trp`:
```sml
let fun f x = x+1
 in f "hi"
 end
```

With inline source map and `--enable-source-maps`:
```
Error
    at Top.f23 (/Users/.../simple-1.trp:1:15)
```

The error correctly points to line 1, column 15 - the `+` operator where the type error occurs.

### Implementation

**Compiler changes** (`compiler/app/Main.hs`):
```haskell
-- After generating JS code, append inline source map
when sourceMapEnabled $ do
  let mapJson = buildSourceMap outPath mappings
      mapBytes = BL.toStrict (Aeson.encode mapJson)
      mapBase64 = B64.encode mapBytes
      comment = "\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,"
                ++ BS.unpack mapBase64 ++ "\n"
  appendFile outPath comment
```

**Script changes** (`local.sh`, `network.sh`):
```bash
node --enable-source-maps --stack-trace-limit=1000 "$TROUPE_ROOT/rt/built/troupe.mjs" ...
```

### Why Inline Source Maps?

| Aspect | External `.map` file | Inline (base64) |
|--------|---------------------|-----------------|
| File management | Two files to track | Self-contained |
| Temp files | Need to create/delete `.map` too | Just one temp file |
| Size overhead | Separate file | ~4-5% increase |
| Dynamic code | No `.map` file exists | Same approach works |

Inline source maps are preferred because:
1. Self-contained - no separate files to manage
2. Works with temp file workflow in `local.sh`
3. Follows Troupe's philosophy (code already embeds `.serialized` data)

---

## Part 2: Dynamic Code Solution

### The Challenge

Dynamic code (deserialized closures) cannot use Node.js's automatic source map support because:

1. Code is constructed via `new Function(...)`
2. The function has no filename (appears as `<anonymous>` in stack traces)
3. `//# sourceMappingURL` comments inside `Function` body are ignored
4. Even the `source-map-support` npm package cannot help - it needs a filename to look up maps

### The Solution: Runtime Stack Trace Translation

Since Node.js can't help, the runtime must translate stack traces manually:

1. **Compiler returns source maps in JSON output** (already has the infrastructure)
2. **Runtime merges source maps per namespace** (adjusting line numbers as code is concatenated)
3. **On error, runtime parses stack trace** and translates positions using the stored source maps

### How Deserialization Works (Current)

From `rt/src/deserialize.mts`:

```typescript
// Compiler subprocess returns JSON per function:
// { fname: "f23", code: "...", libs: [...], atoms: [...] }

for (let i = 0; i < serobj.namespaces.length; i++) {
    let ns = serobj.namespaces[i]
    let nsFun = HEADER  // ~5 lines of setup code

    for (let j = 0; j < ns.length; j++) {
        let snippetJson = JSON.parse(snippets[k++]);
        nsFun += snippetJson.code;  // Concatenate function code
    }

    // Create namespace via Function constructor
    let NS = Reflect.construct(Function, [...argNames, nsFun])
    ctxt.namespaces[i] = Reflect.construct(NS, argValues)
}
```

Key observations:
- Multiple functions are concatenated into one `nsFun` string
- One `Function` constructor call per namespace
- Stack trace line numbers refer to the merged code

### Extended Compiler JSON Output

Current output:
```json
{
  "libs": [...],
  "fname": "f23",
  "code": "this.f23 = ($env) => { ... }",
  "atoms": [...]
}
```

Extended output:
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

### Per-Namespace Source Map Merging

Since all functions in a namespace are concatenated, we must merge their source maps with adjusted line numbers:

```typescript
const FUNCTION_WRAPPER_LINES = 2;  // new Function() adds 2 wrapper lines
const HEADER_LINES = countLines(HEADER);

// Registry: namespaceId -> merged source map
const namespaceSourceMaps = new Map<number, SourceMap>();

for (let i = 0; i < serobj.namespaces.length; i++) {
    let ns = serobj.namespaces[i]
    let nsFun = HEADER
    let currentLine = FUNCTION_WRAPPER_LINES + HEADER_LINES;

    const mergedMappings: Mapping[] = [];
    const sources = new Set<string>();
    const sourcesContent = new Map<string, string>();

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
            // ... merge sourcesContent
        }

        nsFun += snippetJson.code;
        currentLine += countLines(snippetJson.code);
    }

    // Build merged source map for this namespace
    const mergedMap = {
        version: 3,
        sources: Array.from(sources),
        mappings: encodeMappings(mergedMappings),
        // ...
    };
    namespaceSourceMaps.set(i, mergedMap);

    // Continue with normal namespace construction...
}
```

### Runtime Stack Trace Translation

When an error occurs in dynamic code:

```typescript
// In error handling code (TroupeError.mts or similar)

function translateDynamicStack(error: Error): string {
    const lines = error.stack.split('\n');
    const translated: string[] = [];

    for (const line of lines) {
        // Match: "at Object.f23 (eval at <anonymous> (...), <anonymous>:15:8)"
        const match = line.match(/at (?:Object\.)?(\w+) \(eval.*<anonymous>:(\d+):(\d+)\)/);

        if (match) {
            const [, funcName, lineStr, colStr] = match;
            const jsLine = parseInt(lineStr);
            const jsCol = parseInt(colStr);

            // Find which namespace this function belongs to
            const namespaceId = findNamespaceForFunction(funcName);
            if (namespaceId !== undefined) {
                const sourceMap = namespaceSourceMaps.get(namespaceId);
                if (sourceMap) {
                    const original = lookupPosition(sourceMap, jsLine, jsCol);
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

### Function Constructor Line Offset

The `new Function('rt', code)` constructor wraps code like this:

```javascript
function anonymous(rt) {
<your code here>
}
```

This adds **2 lines** before the actual code. So if an error occurs at line 5 in the raw code, the stack trace will show line 7.

When looking up in the source map, subtract 2 from the stack trace line number (plus account for HEADER lines).

---

## Implementation Plan

### Phase 16a: Inline Source Maps for Static Code

**Files**: `compiler/app/Main.hs`

1. After writing JS file, append inline source map comment
2. Use base64 encoding of the JSON source map
3. Only when `-m` flag is provided (or make it default)

### Phase 16b: Enable Source Maps in Scripts

**Files**: `local.sh`, `network.sh`

1. Add `--enable-source-maps` to node invocation
2. This enables automatic translation for static code

### Phase 16c: Extend Compiler JSON Output

**Files**: `compiler/src/Stack2JS.hs`

1. Modify `JSOutput` data type to include `sourceMap` field
2. Modify `stack2JSON` to generate and include source map
3. The source map should cover the code in that JSON snippet

```haskell
data JSOutput = JSOutput
    { libs :: [LibAccess]
    , fname :: Maybe String
    , code :: String
    , atoms :: [Basics.AtomName]
    , sourceMap :: Maybe Value  -- NEW: Aeson Value for source map JSON
    } deriving (Show, Generic)
```

### Phase 16d: Runtime Source Map Merging

**Files**: `rt/src/deserialize.mts`

1. Parse `sourceMap` from compiler JSON output
2. Track line offsets as code is concatenated
3. Merge source maps per namespace with adjusted line numbers
4. Store in a global registry

### Phase 16e: Runtime Stack Translation

**Files**: `rt/src/TroupeError.mts` or new `rt/src/SourceMapResolver.mts`

1. On error, capture the stack trace
2. Parse to find dynamic function calls (`<anonymous>:line:col`)
3. Look up in namespace source map registry
4. Translate and display Troupe source positions

### Phase 16f: Source Map Library

**Files**: `rt/package.json`, new utilities

1. Add `source-map` npm package as dependency (already in devDependencies)
2. Create utilities for:
   - Parsing VLQ-encoded mappings
   - Merging source maps with line offsets
   - Looking up original positions

---

## Data Flow Summary

### Static Code Path
```
source.trp
    ↓ (compiler with -m flag)
source.js + inline source map comment
    ↓ (node --enable-source-maps)
Automatic stack trace translation
```

### Dynamic Code Path
```
Serialized closure (base64 IR)
    ↓ (troupec --json-ir)
JSON with code + sourceMap per function
    ↓ (deserialize.mts)
Merged source map per namespace (stored in registry)
    ↓ (on error)
Runtime parses stack, looks up in registry, translates
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `compiler/app/Main.hs` | Append inline source map to JS output |
| `compiler/src/Stack2JS.hs` | Add `sourceMap` to `JSOutput`, generate in `stack2JSON` |
| `local.sh` | Add `--enable-source-maps` |
| `network.sh` | Add `--enable-source-maps` |
| `rt/src/deserialize.mts` | Parse source maps, merge per namespace, store in registry |
| `rt/src/TroupeError.mts` | Translate stack traces using registry |
| `rt/src/SourceMapResolver.mts` | NEW: Utilities for source map operations |
| `rt/package.json` | Move `source-map` from devDependencies to dependencies |

---

## Testing Strategy

### Static Code Tests

1. Compile `simple-1.trp` with `-m` flag
2. Verify inline source map is appended
3. Run with `--enable-source-maps`
4. Trigger error and verify stack shows Troupe positions

### Dynamic Code Tests

1. Create test that serializes and deserializes a closure
2. Trigger error in deserialized code
3. Verify translated stack trace shows Troupe positions

### Test Cases

```sml
(* Test 1: Simple type error *)
let fun f x = x + 1
 in f "hi"
 end
(* Expected: error at line 1, col 15 (the +) *)

(* Test 2: Nested calls *)
let fun g y = y + 1
    fun f x = g x
 in f "hi"
 end
(* Expected: error at line 1, stack shows call chain *)

(* Test 3: Dynamic code - requires multinode test *)
(* Send closure over network, execute, verify positions *)
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `source-map` package adds runtime overhead | Only used on error path, not hot path |
| Source map merging complexity | Well-defined algorithm, can be tested in isolation |
| Function wrapper line offset changes | Define as constant, document clearly |
| Stack trace format changes in Node.js | Use robust regex, test across Node versions |

---

## Why This Approach?

### Compared to Phase 14 (Position Parameters)

Phase 14 proposed passing position strings as parameters to assertion functions. Problems:
- Only works for assertion errors, not all runtime errors
- Requires modifying all assertion function signatures
- Doesn't help with IFC errors or other runtime-detected errors

This approach:
- Works for ALL errors (assertions, IFC, etc.)
- No changes to assertion functions needed
- Uses standard source map infrastructure

### Compared to Phase 15 (Function-level `.sourcePos`)

Phase 15 (status-2.md) proposed embedding `.sourcePos` on function objects. Problems:
- Only provides function-level positions (where function is defined)
- Doesn't show where IN the function the error occurred
- For `let fun f x = x+1`, shows `f` at line 1 col 9, but error is at col 15

This approach:
- Provides instruction-level positions
- Shows exactly where the error occurred
- Uses the same source map data but interprets it correctly

### Why Per-Namespace Merging?

The deserializer concatenates multiple functions into one code block per namespace. We must merge source maps because:
- Stack traces show line numbers in the merged code
- Individual function source maps have line numbers starting at 1
- Must adjust each function's mappings by its offset in merged code

---

## Appendix: Source Map Merging Algorithm

```typescript
interface Mapping {
    generatedLine: number;
    generatedColumn: number;
    originalLine: number;
    originalColumn: number;
    source: string;
}

function adjustSourceMapLines(
    sourceMap: SourceMap,
    lineOffset: number
): Mapping[] {
    const consumer = new SourceMapConsumer(sourceMap);
    const adjusted: Mapping[] = [];

    consumer.eachMapping(m => {
        adjusted.push({
            generatedLine: m.generatedLine + lineOffset,
            generatedColumn: m.generatedColumn,
            originalLine: m.originalLine,
            originalColumn: m.originalColumn,
            source: m.source
        });
    });

    return adjusted;
}

function mergeMappings(allMappings: Mapping[]): string {
    // Sort by generated position
    allMappings.sort((a, b) =>
        a.generatedLine - b.generatedLine ||
        a.generatedColumn - b.generatedColumn
    );

    // Encode to VLQ format
    return encodeVLQ(allMappings);
}
```

---

## Conclusion

This solution provides complete source position information for both static and dynamic Troupe code:

- **Static code**: Leverages Node.js native support via inline source maps
- **Dynamic code**: Runtime translation using merged per-namespace source maps

The approach is:
- **Unified**: Uses V3 source maps throughout
- **Precise**: Instruction-level, not just function-level
- **Complete**: Works for all error types
- **Maintainable**: Builds on existing infrastructure

---

**Next Steps**:
1. Implement Phase 16a-b (static code - quick win)
2. Test with various error scenarios
3. Implement Phase 16c-f (dynamic code)
4. Add multinode tests for dynamic code positions
