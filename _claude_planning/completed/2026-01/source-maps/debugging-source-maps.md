# Debugging Source Maps in Troupe

This document explains how source maps work in Troupe and how to debug issues.

---

## Line/Column Numbering (Important!)

Source maps use different conventions that cause confusion:

| Context | Lines | Columns |
|---------|-------|---------|
| V3 Source Map Spec | 0-based | 0-based |
| source-map npm library output | 1-based | 0-based |
| Editor display (VSCode, etc.) | 1-based | 1-based |
| Troupe Parser (internal) | 1-based | 1-based |

The `inspect-sourcemap` tool has two modes:
```bash
# Default: lines 1-based, columns 0-based (matches source-map library)
npx ts-node rt/src/tools/inspect-sourcemap.ts out.js.map

# With --one-based: all 1-based (matches editor display)
npx ts-node rt/src/tools/inspect-sourcemap.ts --one-based out.js.map
```

**Use `--one-based` when correlating with editor line/column numbers.**

---

## Key Files

| Component | File | Purpose |
|-----------|------|---------|
| Compiler | `compiler/src/TroupeSourceMap.hs` | Builds V3 source map JSON |
| Compiler | `compiler/src/Stack2JS.hs` | Emits markers, collects mappings |
| Inspector | `rt/src/tools/inspect-sourcemap.ts` | Decodes and displays mappings |

---

## How Source Maps Are Generated

### Position Threading

Positions (`PosInf`) flow through the compiler pipeline:

```
Parser (Direct.hs)     →  SrcPosInf "file.trp" 3 5
    ↓
CaseElimination        →  positions threaded
    ↓
Core.hs                →  positions preserved
    ↓
RetDFCPS.hs (CPS)      →  positions preserved
    ↓
ClosureConv.hs (IR)    →  positions preserved
    ↓
IR2Raw.hs              →  positions preserved
    ↓
Raw2Stack.hs           →  positions preserved
    ↓
Stack2JS.hs            →  markers emitted
```

### Marker System

In `Stack2JS.hs`, `emitMarker` inserts marker comments:

```haskell
emitMarker :: PosInf -> W PP.Doc
emitMarker (SrcPosInf file line col) = do
  markerId <- gets markerCounter
  tell ([], [], [], [(markerId, pos)])
  return $ text ("/*SM:" ++ show markerId ++ "*/")
```

This produces JS like:
```javascript
/*SM:0*/const x = 5;
/*SM:1*/if (cond) {
```

### Marker Processing

After rendering, `processMarkers`:
1. Finds each `/*SM:N*/` marker
2. Looks up source position for marker N
3. Computes generated line/column from marker location
4. Creates V3 mapping via `collectMapping`
5. Strips marker from final output

### Source Map Output

`buildSourceMap` creates the final JSON with VLQ-encoded mappings.

---

## Debugging Workflow

### 1. Compile with Source Map

```bash
bin/troupec myfile.trp -o out/out.js --source-map -v
```

### 2. Inspect the Source Map

```bash
# Show mappings with editor-style numbering
npx ts-node rt/src/tools/inspect-sourcemap.ts --one-based out/out.js.map
```

Example output:
```
=== Source Map Info ===
File: out/out.js
Sources: [ '/path/to/myfile.trp' ]
Display mode: 1-based (editor)

=== Decoded Mappings ===
  Gen L6:  3 -> Orig L1:9
  Gen L13:  5 -> Orig L3:21
```

### 3. Correlate with Files

With `--one-based`, you can directly match:
- "Gen L6:3" → line 6, column 3 in the JS file
- "Orig L1:9" → line 1, column 9 in the .trp file

Open both files side-by-side and navigate to those positions.

### 4. Check Intermediate Outputs

Compile with `-v` to see all stages in `/out/`:

| File | Stage |
|------|-------|
| `out.syntax` | Parser output (original positions) |
| `out.nopats` | Pattern elimination |
| `out.lowered` | Core lowered |
| `out.cps` | CPS transform |
| `out.ir` | IR (closure conv) |
| `out.stack` | Stack code |
| `out.stack.js` | Final JavaScript |
| `out.stack.js.map` | Source map |

---

## Common Issues

### No mappings or empty source map

**Check:**
1. Is `--source-map` flag used?
2. Look at `out.stack` - are positions present?
3. Is `emitMarker` being called in Stack2JS?

### Wrong line/column numbers

**Check:**
1. Use `--one-based` for editor comparison
2. Verify Parser captures correct positions (check `out.syntax`)
3. Check `collectMapping` in `TroupeSourceMap.hs` - it adjusts columns

### Positions lost during optimization

Compare before/after:
```bash
cat out/out.ir     # pre-optimization
cat out/out.iropt  # post-optimization
```

If positions become `NoPos`, the optimizer pass needs fixing.

---

## Position Types

```haskell
data PosInf
  = NoPos                              -- No position info
  | SrcPosInf FilePath Int Int         -- Source file, line, column (1-based)
  | RTGen                              -- Runtime-generated code
```

Only `SrcPosInf` produces mappings.

---

## Quick Reference

| Task | Command |
|------|---------|
| Compile with source map | `bin/troupec file.trp -o out.js --source-map` |
| Compile verbose | `bin/troupec file.trp -o out.js -v` |
| Inspect (spec format) | `npx ts-node rt/src/tools/inspect-sourcemap.ts out.js.map` |
| Inspect (editor format) | `npx ts-node rt/src/tools/inspect-sourcemap.ts --one-based out.js.map` |

---

## Which Constructs Emit Markers

In `Stack2JS.hs`, these call `emitMarker`:
- `AssignRaw` - raw value assignments
- `AssignLVal` - LVal assignments
- `MkFunClosures` - function/closure creation
- `If` terminator - conditionals
- `Error` terminator - error throws
- `TailCall` terminator - tail calls
- Constant definitions

Constructs not in this list won't appear in the source map.

---

## Adding New Mappings

1. Find the construct in `Stack2JS.hs`
2. Call `emitMarker pos` and prepend to generated code:
   ```haskell
   ir2js (YourConstruct ... pos) = do
     marker <- emitMarker pos
     code <- generateCode ...
     return $ marker PP.<> code
   ```
3. Rebuild: `make compiler`
4. Test: compile and inspect the source map
