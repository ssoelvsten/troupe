# Untyped Null Initializations

**Status:** Pending
**Risk:** Low
**Impact:** Medium - improves type safety

---

## Summary

Module-level and class-level variables initialized to `null` without proper type annotations. These should explicitly declare `| null` in their type.

---

## Module-Level Variables

### 1. SysState.mts:3
```typescript
// Before
let __state: RuntimeInterface = null;

// After
let __state: RuntimeInterface | null = null;
```
- [ ] Fixed

---

### 2. deserialize.mts:50
```typescript
// Before
let __compilerOsProcess = null;

// After
let __compilerOsProcess: ChildProcess | null = null;
```
- [ ] Fixed

---

### 3. deserialize.mts:52
```typescript
// Before
let __rtObj = null;

// After
let __rtObj: RuntimeInterface | null = null;
```
- [ ] Fixed

---

### 4. deserialize.mts:56
```typescript
// Before
let __currentCallback = null;

// After
let __currentCallback: ((result: any) => void) | null = null;
```
- [ ] Fixed

---

### 5. deserialize.mts:57
```typescript
// Before
let __currentDeserializedJson = null;

// After
let __currentDeserializedJson: string | null = null;
```
- [ ] Fixed

---

### 6. deserialize.mts:58
```typescript
// Before
let __trustLevel = null;

// After
let __trustLevel: Level | null = null;
```
- [ ] Fixed

---

### 7. p2p/p2p.mts:137
```typescript
// Before
let _rt = null;

// After
let _rt: RuntimeInterface | null = null;
```
- [ ] Fixed

---

## Class Properties

### 8. Thread.mts - Mailbox class (lines 114-119)
```typescript
// Before
this.caps = null;
this.peek_cache_index = null;
this.peek_cache_position = null;
this.peek_cache_lowb  = null;
this.peek_cache_highb = null

// After - add types to class definition
caps: string | null;
peek_cache_index: number | null;
peek_cache_position: number | null;
peek_cache_lowb: Level | null;
peek_cache_highb: Level | null;
```
- [ ] Fixed

---

### 9. Thread.mts:254
```typescript
// Property: pini_uuid
// Before (no type annotation)
this.pini_uuid = null;

// After
pini_uuid: string | null = null;
```
- [ ] Fixed

---

### 10. Thread.mts:264
```typescript
// Property: processDebuggingName
// Before (no type annotation)
this.processDebuggingName = null;

// After
processDebuggingName: string | null = null;
```
- [ ] Fixed

---

### 11. Scheduler.mts:51
```typescript
// Before
this.__currentThread = null;

// After
__currentThread: Thread | null = null;
```
- [ ] Fixed

---

### 12. UserRuntimeZero.mts:41
```typescript
// Before
this.ret = null;

// After
ret: ((val: any) => any) | null = null;
```
- [ ] Fixed

---

### 13. BaseFunction.mts:12, 30
```typescript
// Before
closure.env = null;

// After - in RawClosure type definition
env: Record<string, any> | null;
```
- [ ] Fixed

---

### 14. deserialize.mts:31 and serialize.mts:31
```typescript
// Before
explainstr: string = null;

// After
explainstr: string | null = null;
```
- [ ] Fixed (both files)

---

## Verification

After all fixes:
```bash
make rt && make test
```
