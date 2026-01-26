# Html Library Analysis - Index

## Summary

Analysis of `/lib/Html.trp` identified code smells, performance issues, and opportunities for new library extraction.

## Key Findings

### Code Smells

| Issue | Severity | Resolution |
|-------|----------|------------|
| General-purpose string functions in Html | Medium | Move to StringExt |
| URL logic mixed with HTML generation | Medium | Extract to Url library |
| O(n*d) string concatenation | High | StringBuilder library |
| Full string lowercase for prefix check | Low | startsWithIgnoreCase |
| Linear search in isUrlAttr | Low | Use Set (minor) |

### Performance Measurements

**Baseline benchmarks** (current implementation):

| Benchmark | Size | Output | Time Factor |
|-----------|------|--------|-------------|
| Wide (1000 items) | 1000 siblings | 16,899 chars | 1x baseline |
| Deep (200 levels) | 200 nesting | 5,799 chars | N/A |
| Escape (10KB) | 10KB text | 14,007 chars | N/A |
| Real-world (500 rows) | 500 table rows | 53,794 chars | N/A |
| Extreme (150x150) | 150 depth × 150 items | 32,394 chars | ~2.8s |

**Total benchmark time**: ~3.6 seconds for all tests

### Proposed Libraries

| Library | Priority | Purpose | Blocked By |
|---------|----------|---------|------------|
| StringBuilder | P0 | Efficient string building | Nothing |
| StringExt | P1 | String utilities | Nothing |
| Char | P2 | Character utilities | `fromCharCode` primitive |
| Url | P3 | URL handling | StringExt (optional) |

## Files in This Analysis

| File | Description |
|------|-------------|
| [analysis.md](./analysis.md) | Full analysis document |
| [StringBuilder-outline.md](./StringBuilder-outline.md) | StringBuilder library design |
| [StringExt-outline.md](./StringExt-outline.md) | StringExt library design |

## Benchmark Files

| File | Purpose |
|------|---------|
| `tests/_unautomated/claude/benchmark_html_perf.trp` | General performance benchmarks |
| `tests/_unautomated/claude/benchmark_nesting_stress.trp` | Deep nesting stress test |
| `tests/_unautomated/claude/benchmark_extreme_stress.trp` | Extreme stress test |

## Recommended Next Steps

### Phase 1: StringBuilder (Highest Impact)
1. Implement `lib/StringBuilder.trp`
2. Create `tests/lib/StringBuilder.trp`
3. Benchmark before/after on Html
4. Refactor Html.render to use StringBuilder

### Phase 2: StringExt
1. Implement `lib/StringExt.trp`
2. Add `startsWithIgnoreCase` for efficient URL checking
3. Move string functions from Html to StringExt
4. Update Html to import StringExt

### Phase 3: Cleanup Html
1. Remove duplicated functions
2. Use StringExt for string operations
3. Use StringBuilder for rendering
4. Document security features

## Complexity Improvement

| Operation | Current | With StringBuilder |
|-----------|---------|-------------------|
| render (nested) | O(n × d) | O(n) |
| render (flat) | O(n) | O(n) |
| escapeHtml | O(3n) | O(3n)* |

*Escaping not improved by StringBuilder, but could be optimized separately

## Decision Points

1. **Should we create StringBuilder?**
   - Yes: Clear performance benefit for nested HTML
   - Complexity is straightforward
   - No runtime changes needed

2. **Should we create StringExt?**
   - Yes: Removes code smell from Html
   - Enables reuse across codebase
   - `startsWithIgnoreCase` is more efficient than current approach

3. **Should we create Char library?**
   - Defer: Blocked by need for `fromCharCode` primitive
   - StringExt can work without it using String.subCode

4. **Should we create Url library?**
   - Later: Lower priority, Html's current approach works
   - Could be done after StringExt stabilizes
