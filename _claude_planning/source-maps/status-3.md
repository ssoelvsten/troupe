# Source Maps: Phase 16 - Inline Source Maps for Unified Error Reporting

> **SUPERSEDED**: This document has been superseded by [status-4.md](status-4.md). While the inline source map approach for static code is correct, this document incorrectly claimed that Node.js's `--enable-source-maps` would work for dynamic code. It does NOT - the `Function` constructor ignores `//# sourceMappingURL` comments. See status-4.md for the complete solution that handles both static and dynamic code correctly.

**Date**: 2026-01-03
**Subject**: Inline source maps as the unified solution for Troupe source positions
**Status**: Superseded by status-4.md

---

## Executive Summary

This document proposes using **inline source maps** (base64-encoded, embedded directly in generated JS) as the unified approach for source position information in Troupe error messages. This approach:

1. Works for both static code (compiled `.trp` files) and dynamic code (deserialized closures)
2. Leverages Node.js's native `--enable-source-maps` support for automatic stack trace translation
3. Is self-contained - no separate `.map` files to manage
4. Has minimal overhead (~4-5% file size increase)

---

## Background: The Problem

When a Troupe program encounters a runtime error, users see:

```
Runtime error in thread e502f55c-9a2a-453c-a1ef-7ad9b7e62ecd@{}%{}
>> value "hi" is not a number
```

This tells users *what* went wrong but not *where* in their Troupe source code. The JS stack trace shows generated code locations (e.g., `Top.f23 at line 15`), which are meaningless to users.

### Previous Approaches Considered

1. **Phase 14 (External Source Maps)**: Generate `.js.map` files alongside `.js` files
   - Works for static code
   - **Problem**: Doesn't work for dynamic/deserialized code (no `.map` file exists)

2. **Phase 15 (status-2.md - Function-level positions via compiler JSON)**: Embed `.sourcePos` on function objects
   - Works for dynamic code
   - **Problem**: Only provides function-level positions, not instruction-level
   - For `let fun f x = x+1 in f "hi" end`, tells us `f` is at line 1 col 9, but error is at col 15 (the `+`)

---

## The Solution: Inline Source Maps

### What Are Inline Source Maps?

Instead of writing source maps to separate `.map` files, embed them directly in the generated JS as a base64-encoded data URL:

```javascript
// ... generated code ...
module.exports = Top
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLC...
```

### How It Works

1. **Compiler generates source map data** (already implemented in Phase 14)
2. **Base64-encode the source map JSON**
3. **Append as a data URL comment** to the generated JS
4. **Node.js `--enable-source-maps`** automatically translates stack traces

### Proof of Concept

Testing with `simple-1.trp`:

```sml
let fun f x = x+1
 in f "hi"
 end
```

**Without source maps:**
```
Error
    at Top.f23 (/private/var/folders/.../tmp.js:15:8)
```

**With inline source map + `--enable-source-maps`:**
```
Error
    at Top.f23 (/Users/aslan/Prime/Troupe/tests/_unautomated/simple-1.trp:1:15)
```

The error now points to **line 1, column 15** - exactly where the `+` operator is in the Troupe source!

---

## Why Inline Source Maps Are Right for Troupe

### 1. Works for Both Static and Dynamic Code

**Static code** (compiled `.trp` → `.js`):
- Inline map is embedded in the generated file
- Works identically to external maps

**Dynamic code** (deserialized closures):
- When closures are serialized and sent over the network, the source map travels with the code
- The deserializer can reconstruct the code with its embedded source map
- No need to manage separate `.map` files that don't exist for dynamic code

This is the **critical advantage** over external source maps.

### 2. Self-Contained Code Philosophy

Troupe already embeds serialized IR in generated JS:

```javascript
this.f23.serialized = "AAAAAAAAAAADZjIzAAAAAAAAAAhmX2FyZzEyNAAA..."
```

This allows closures to be serialized and sent across the network. Inline source maps follow the same philosophy: **the generated code contains everything needed for execution and debugging**.

### 3. Leverages Native Node.js Support

Node.js has built-in source map support via `--enable-source-maps`:
- Automatically parses inline source maps
- Translates stack traces without any runtime code changes
- Works with both inline and external source maps
- Actively maintained by the Node.js team

We don't need to write any source map parsing code in the Troupe runtime.

### 4. Acceptable Overhead

| File | JS Size | Map Size | Inline Overhead |
|------|---------|----------|-----------------|
| simple-1.trp | 16,220 B | 458 B | +678 B (+4.2%) |
| simple.trp | 20,359 B | 756 B | ~+1,000 B (+5%) |
| List.trp (library) | 589,109 B | 17,438 B | ~+23,000 B (+4%) |

The overhead is approximately `map_size * 1.37` (base64 encoding) plus ~60 bytes for the URL prefix.

For context:
- The `.serialized` property on functions already adds significant size
- 4-5% is negligible compared to the debugging value
- Can be disabled with a flag for production if needed

### 5. Simpler Implementation

External source maps require:
- Writing `.map` files to the correct location
- Ensuring paths are correct in the `//# sourceMappingURL` comment
- Managing file associations at runtime
- Handling cases where `.map` files are missing

Inline source maps require:
- Base64-encode the map JSON
- Append one comment to the generated JS
- Done.

### 6. Works with Temp Files

The `local.sh` script compiles to a temp file:
```bash
tmp=`mktemp`.js
"$TROUPE_ROOT/bin/troupec" ... --output="$tmp"
node ... -f="$tmp"
rm "$tmp"
```

With external source maps:
- Would need to also create and clean up `$tmp.map`
- Path in the source map needs to reference the original `.trp` file correctly

With inline source maps:
- The temp file is self-contained
- No additional files to manage
- Works automatically

---

## Implementation Plan

### Phase 16a: Compiler Changes (Main.hs)

Modify the compiler to embed inline source maps when `-m` flag is used:

```haskell
-- In process function, after generating JS:
when sourceMapEnabled $ do
  let mapJson = buildSourceMap outPath mappings
      mapBase64 = B64.encode (BL.toStrict (Aeson.encode mapJson))
      sourceMappingURL = "//# sourceMappingURL=data:application/json;charset=utf-8;base64,"
                         ++ BS.unpack mapBase64
  -- Append to JS output instead of writing separate .map file
  appendFile outPath ("\n" ++ sourceMappingURL ++ "\n")
```

**Changes required:**
1. Add `Data.ByteString.Base64` import
2. Replace `BL.writeFile (outPath ++ ".map")` with inline embedding
3. Consider keeping external map generation as an option (`-m external` vs `-m inline`)

### Phase 16b: Runtime Scripts

Modify `local.sh` and `network.sh` to enable source maps:

```bash
# Change:
node --stack-trace-limit=1000 "$TROUPE_ROOT/rt/built/troupe.mjs" ...

# To:
node --enable-source-maps --stack-trace-limit=1000 "$TROUPE_ROOT/rt/built/troupe.mjs" ...
```

### Phase 16c: Default Behavior

Consider making source maps the default (always enabled) rather than opt-in:
- The overhead is minimal
- The debugging value is high
- Users shouldn't need to remember flags

If size is a concern for production, add a `--no-source-map` flag instead.

### Phase 16d: Integration with Deserialization

For dynamic code, the deserializer (`rt/src/deserialize.mts`) reconstructs code using the compiler subprocess. The compiler's JSON output mode (`--json-ir`) should also include source map data:

```typescript
// Current JSON output:
{ libs: [...], fname: "f23", code: "...", atoms: [...] }

// Extended with source map:
{ libs: [...], fname: "f23", code: "...", atoms: [...], sourceMap: {...} }
```

The deserializer can then embed the source map when constructing the Function:

```typescript
let codeWithMap = snippetJson.code;
if (snippetJson.sourceMap) {
  const mapBase64 = btoa(JSON.stringify(snippetJson.sourceMap));
  codeWithMap += `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${mapBase64}`;
}
let NS = Reflect.construct(Function, [...argNames, codeWithMap]);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `compiler/app/Main.hs` | Embed inline source map instead of writing `.map` file |
| `compiler/src/Stack2JS.hs` | Possibly add source map data to JSON output |
| `local.sh` | Add `--enable-source-maps` to node invocation |
| `network.sh` | Add `--enable-source-maps` to node invocation |
| `rt/src/deserialize.mts` | Embed source maps in reconstructed code (Phase 16d) |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| File size increase | ~4-5% is acceptable; can add `--no-source-map` flag |
| Source code exposure | Already exposed via `sourcesContent`; not a concern for Troupe's use case |
| Node.js version compatibility | `--enable-source-maps` available since Node 12.12.0 (Oct 2019) |
| Performance impact | Source maps only parsed when errors occur; no hot path impact |

---

## Comparison with Alternatives

| Approach | Static Code | Dynamic Code | Precision | Complexity |
|----------|-------------|--------------|-----------|------------|
| External source maps | Works | No `.map` file | Instruction-level | Medium |
| Function-level `.sourcePos` | Works | Works | Function-level only | Medium |
| **Inline source maps** | Works | Works | Instruction-level | Low |

**Inline source maps are the only approach that provides instruction-level precision for both static and dynamic code.**

---

## Future Enhancements

1. **Source snippets in error messages**: With file path and line number, the runtime could show the actual source line
2. **IDE integration**: Source maps enable debugger integration, breakpoints, etc.
3. **Production mode**: Add `--no-source-map` flag for production builds where size matters

---

## Conclusion

Inline source maps provide:
- **Unified solution** for both static and dynamic code
- **Instruction-level precision** in error messages
- **Minimal overhead** (~4-5% file size increase)
- **Zero runtime code changes** (leverages Node.js native support)
- **Self-contained code** (follows Troupe's existing philosophy)

This is the right approach because it solves the complete problem (static + dynamic code) with minimal complexity and acceptable trade-offs.

---

**Next Steps:**
1. Implement Phase 16a (compiler changes)
2. Implement Phase 16b (script changes)
3. Test with various error scenarios
4. Implement Phase 16d (deserialization) for complete dynamic code support
