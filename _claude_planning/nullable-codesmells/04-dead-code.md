# Dead Code: null Returns After Throws

**Status:** Pending
**Risk:** Very Low
**Impact:** Low - cleanup

---

## Summary

Some functions have `return null;` statements immediately after `throw` statements. These are unreachable and should be removed.

---

## Instances

### 1. RawList.mts:49-50
```typescript
// Before
throw new UserRuntimeError(errMsg)
return null

// After
throw new UserRuntimeError(errMsg)
```
- [ ] Fixed

---

### 2. RawList.mts:54-55
```typescript
// Before
throw new UserRuntimeError(errMsg)
return null

// After
throw new UserRuntimeError(errMsg)
```
- [ ] Fixed

---

### 3. RawList.mts:67-68
```typescript
// Before
throw new UserRuntimeError(errMsg)
return null

// After
throw new UserRuntimeError(errMsg)
```
- [ ] Fixed

---

## Verification

After all fixes:
```bash
make rt && make test
```
