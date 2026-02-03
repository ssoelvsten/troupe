# Nullish Coalescing Opportunities

**Status:** Pending
**Risk:** Very Low
**Impact:** Low - improves readability

---

## Summary

Replace ternary expressions like `x == null ? default : x` with the nullish coalescing operator `??`.

---

## Instances

### 1. Lval.mts:27
```typescript
// Before
this.tlev = tlev == null ? l : tlev;

// After
this.tlev = tlev ?? l;
```
- [ ] Fixed
- **Note:** Also in 01-loose-equality.md

---

### 2. Lval.mts:90-91 (LValCopyAt constructor)
```typescript
// Before
if (l2 == null) {
    l2 = levels.lub (x.tlev,l)
}

// After - could inline with ??
const effectiveL2 = l2 ?? levels.lub(x.tlev, l);
super(x.val, levels.lub(x.lev, l), effectiveL2);
```
- [ ] Fixed
- **Note:** Slightly more complex due to lub computation

---

## Verification

After all fixes:
```bash
make rt && make test
```
