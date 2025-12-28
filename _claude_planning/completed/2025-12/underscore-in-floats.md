# Task: Underscore in Float Literals

## Status: COMPLETE (implemented with #90)

**Commit:** `3a7384e` on branch `improvements-floats-in-the-frontend`
**Date:** 2025-12-27

## Source
GitHub Issue #89: https://github.com/TroupeLang/Troupe/issues/89
Labels: `compiler (Front-end)`

> "`_` is not supported in literals after the comma"

---

## Implementation

This was implemented as part of the floating point constants work (Issue #90).

The lexer pattern includes underscore support in both the integer and fractional parts:

```alex
@floatlit   = $digit[\_$digit]* \. $digit[\_$digit]* ([eE][\+\-]? $digit[\_$digit]*)?
```

The lexer action filters out underscores before parsing:
```alex
<0>   @floatlit  { mkLs (\s -> TokenFloat (read (filter (/='_') s))) }
```

---

## Verified Examples

All of these now work:
- `3.141_592` → `3.141592`
- `1_000.5` → `1000.5`
- `1_000_000.123_456` → `1000000.123456`
- `6.022_140_76e23` → `6.02214076e23`

---

## Notes

- No separate implementation was needed - the float pattern design included underscores from the start
- Follows the same convention as integer literals which already supported underscores
- See [floating-point-constants.md](./floating-point-constants.md) for full implementation details
