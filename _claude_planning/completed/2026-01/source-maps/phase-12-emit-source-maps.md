# Phase 12: Emit Real Source Maps

**Status**: Pending

**Goal**: Generate actual VLQ-encoded mappings in `.map` files.

---

## Phase 12a: Track output line/column in Stack2JS.hs

**File**: `compiler/src/Stack2JS.hs`

Add line/column tracking to `TheState`:

```haskell
data TheState = TheState
  { ...
  , outputLine :: Int      -- Current output line number
  , outputCol :: Int       -- Current output column
  }
```

---

## Phase 12b: Collect mappings during code generation

**File**: `compiler/src/Stack2JS.hs`

Call `collectMapping` for instructions that have real `PosInf` (not `NoPos` or `RTGen`).

```haskell
recordMapping :: PosInf -> W ()
recordMapping pos = do
  outLine <- gets outputLine
  outCol <- gets outputCol
  case collectMapping pos outLine outCol of
    Just mapping -> tell ([], [], [], [mapping])
    Nothing -> return ()
```

---

## Phase 12c: Write real mappings in Main.hs

**File**: `compiler/app/Main.hs`

Pass collected mappings to `buildSourceMap` instead of empty list.

---

## Test

After completing this phase:
```bash
make compiler
bin/golden --quick
```

Compile a test program with `--source-map` flag. Verify the `.map` file contains real VLQ-encoded mappings (not just empty `"mappings": ""`).

---

## Files Modified

| File | Changes |
|------|---------|
| `compiler/src/Stack2JS.hs` | Add line tracking, collect mappings |
| `compiler/app/Main.hs` | Pass mappings to buildSourceMap |

---

## Next Phase

After completing this phase, proceed to [Phase 13: Runtime Source Map Resolver](phase-13-runtime-resolver.md).
