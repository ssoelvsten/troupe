# Phase 13: Runtime Source Map Resolver

**Status**: SKIPPED (2026-01-02)

**Conclusion**: This phase is not needed. Position strings will be passed directly from the compiler as parameters (Phase 14), not resolved from JavaScript stack traces.

---

## Why This Phase Was Skipped

Initial planning assumed we would need to resolve source map positions at runtime by parsing JavaScript stack traces. However, this approach was **architecturally incorrect** because:

1. **Troupe's call stack is independent of JavaScript's stack trace** - They track different execution models
2. **Threads execute code from multiple sources** - Cannot tie a thread to a single compiled JS file
3. **Direct position passing is simpler** - The compiler can emit position strings directly in the generated code

---

## Architecture Decision

Instead of runtime resolution, we use **direct position passing**:

```
Compiler (Stack2JS.hs)
  ↓
  Emits: assertIsNumber(x, "file.trp:10:5")
  ↓
Runtime (Asserts.mts)
  ↓
  Error: "value 'foo' is not a number at file.trp:10:5"
```

This is:
- **Simpler**: No async resolution, no source-map library dependency
- **More accurate**: Position comes directly from compiler's PosInf data
- **Faster**: No runtime lookup overhead

---

## Files Modified

None - this phase is skipped entirely.

**Note**: The `source-map` npm package remains as a **devDependency** for the debugging tool at [rt/src/tools/inspect-sourcemap.ts](rt/src/tools/inspect-sourcemap.ts), but is not used in runtime code.

---

## Next Phase

Proceed directly to [Phase 14: Error Message Positions](phase-14-position-params.md).

In Phase 14, the compiler will pass position strings as parameters to runtime functions.
