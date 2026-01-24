# Already Compliant Patterns

These patterns are correctly typed and need no changes. Documented for completeness.

---

## Properly Typed Null Unions

| File | Line | Pattern | Notes |
|------|------|---------|-------|
| MailboxProcessor.mts | 31 | `quarantineAuthLVal: LVal \| null = null` | Explicit null union - correct |
| MailboxProcessor.mts | 62 | `quarantineAuth: Level \| null = null` | Explicit null union - correct |
| MailboxProcessor.mts | 35, 84 | `if (quarantineAuthLVal !== null)` | Strict equality - correct |
| QuarantineUtils.mts | 10 | `wrapQuarantineAuth(...): LVal \| null` | Proper return type |
| QuarantineUtils.mts | 19 | `extractQuarantineAuth(...): Level \| null` | Proper return type |
| QuarantineUtils.mts | 11 | `if (auth === null) return null;` | Strict equality - correct |
| Thread.mts | 233 | `lastCallSourcePos: string \| null = null;` | Explicit - correct |
| Thread.mts | 241 | `currentSourceMap: any \| null = null;` | Explicit - correct |
| TroupeError.mts | 24-25 | `getFileName(): string \| null;` | V8 API reflection - correct |
| p2p/p2p.mts | 136 | `let _node: Libp2p = null;` | Already typed |

---

## Proper Non-Null Assertions (Guarded)

| File | Line | Pattern | Guard |
|------|------|---------|-------|
| deserialize.mts | 122 | `result.value!` | After `shouldDrop(result)` check |
| runtimeMonitored.mts | 122 | `result.value!` | After `shouldDrop(result)` check |

---

## Proper Optional Chaining

| File | Line | Pattern |
|------|------|---------|
| Thread.mts | 202 | `if (!value?.isLevel)` |
| persist.mts | 85 | `x.authorityLevel?.hasQuarantinedLabels` |

---

## Intentional Patterns

| File | Line | Pattern | Reason |
|------|------|---------|--------|
| deserialize.mts | 76 | `return null` | Sentinel for empty array |
| Lval.mts | 52 | `return null` | Sentinel for non-closure |
