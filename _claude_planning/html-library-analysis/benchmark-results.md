# StringBuilder Benchmark Results

## Summary

**Unexpected Result**: StringBuilder is currently **slower** than native string concatenation in Troupe.

This is because Troupe runs on JavaScript/V8, which already has highly optimized string operations (likely using ropes internally).

## Benchmark Results

| Test | String Concat | StringBuilder | Winner |
|------|---------------|---------------|--------|
| Deep nesting (100) x 10 | 0.58s | 1.02s | Concat 1.8x faster |
| Extreme (400 depth, 200 items) | 0.53s | 0.75s | Concat 1.4x faster |
| Mega (500 depth, 500 items, 71KB) | 0.54s | 0.90s | Concat 1.7x faster |
| Repeated append (2000 x 5) | 0.59s | 0.98s | Concat 1.7x faster |

## Why StringBuilder is Slower

1. **V8's String Optimization**: JavaScript's V8 engine likely already uses ropes or similar optimizations internally for string concatenation.

2. **Record Overhead**: Each StringBuilder node creates a Troupe record:
   ```sml
   {tag = "Concat", left = b1, right = b2}
   ```
   This has allocation overhead that JavaScript's native `+` doesn't have.

3. **Build Overhead**: The `build` function must traverse the tree and then call `String.concat`, adding work.

4. **IFC Overhead**: Troupe's information flow tracking adds overhead to all operations.

## Theoretical vs Practical

| Aspect | Theory | Practice (Troupe/V8) |
|--------|--------|----------------------|
| Single concat | O(n) | O(1) amortized (V8 optimized) |
| Nested concat | O(n*d) | Much faster due to V8 ropes |
| StringBuilder append | O(1) | O(1) but with record creation |
| StringBuilder build | O(n) | O(n) + tree traversal + concat |

## Conclusion

For Troupe running on JavaScript:
- **Do NOT use StringBuilder for performance** - native `^` is faster
- StringBuilder may still be useful for **code organization** (building HTML in a structured way)
- A **runtime-level** optimization would be needed to beat V8's string handling

## Alternative Approaches

If string building performance is critical:

1. **Runtime Primitive**: Add a native JavaScript StringBuilder to the Troupe runtime
2. **Array-based Builder**: Collect strings in an array, use native JS `join()`
3. **Accept V8's Optimization**: Just use `^` and trust V8

## Files

| File | Purpose |
|------|---------|
| `bench_concat_only.trp` | String concat baseline |
| `bench_builder_only.trp` | StringBuilder baseline |
| `bench_extreme_concat.trp` | Large concat test |
| `bench_extreme_builder.trp` | Large builder test |
| `bench_mega_concat.trp` | Very large concat |
| `bench_mega_builder.trp` | Very large builder |
| `bench_append_concat.trp` | Repeated append (concat) |
| `bench_append_builder.trp` | Repeated append (builder) |
