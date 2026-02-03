# Loose Equality Checks with null/undefined

**Status:** Pending
**Risk:** Low
**Impact:** High - improves code clarity and catches potential bugs

---

## Summary

Using `==` and `!=` with null/undefined conflates the two values and can hide bugs. Replace with strict equality `===`/`!==`.

---

## Instances

### 1. Lval.mts:27 - Ternary null check
```typescript
// Before
this.tlev = tlev == null?l:tlev;

// After
this.tlev = tlev ?? l;
```
- [ ] Fixed
- **Note:** Also converts to nullish coalescing

---

### 2. Lval.mts:29 - Loose undefined check
```typescript
// Before
if (v._troupeType == undefined) {

// After
if (v._troupeType === undefined) {
```
- [ ] Fixed

---

### 3. Lval.mts:59 - Loose undefined inequality
```typescript
// Before (marked "ugly hack!")
if (v.stringRep != undefined) {

// After
if (v.stringRep !== undefined) {
```
- [ ] Fixed

---

### 4. Lval.mts:69 - Loose undefined check
```typescript
// Before
if (l.stringRep == undefined) {

// After
if (l.stringRep === undefined) {
```
- [ ] Fixed

---

### 5. NodeManager.mts:34 - Loose null inequality
```typescript
// Before
if (this.localNode != null) {

// After
if (this.localNode !== null) {
```
- [ ] Fixed

---

### 6. NodeManager.mts:42 - Loose null check
```typescript
// Before
if (this.localNode.nodeId == null) {

// After
if (this.localNode.nodeId === null) {
```
- [ ] Fixed

---

### 7. NodeManager.mts:62 - Loose undefined check
```typescript
// Before
if (this.localNode == undefined) {

// After
if (this.localNode === undefined) {
```
- [ ] Fixed

---

### 8. NodeManager.mts:71 - Loose undefined check
```typescript
// Before
if (this.localNode == undefined) {

// After
if (this.localNode === undefined) {
```
- [ ] Fixed

---

### 9. LValCopyAt constructor (Lval.mts:90)
```typescript
// Before
if (l2 == null) {

// After
if (l2 === null) {
```
- [ ] Fixed

---

### 10. LCopyVal constructor (Lval.mts:98)
```typescript
// Implicit: l2:Level = null uses loose check internally
```
- [ ] Reviewed

---

### 11. listStringRep (Lval.mts:111)
```typescript
// Before
function listStringRep(x, omitLevels = false, taintRef = null) {

// After - add type annotations
function listStringRep(x: LVal[], omitLevels: boolean = false, taintRef: {lev: Level} | null = null) {
```
- [ ] Fixed

---

## Verification

After all fixes:
```bash
make rt && make test
```
