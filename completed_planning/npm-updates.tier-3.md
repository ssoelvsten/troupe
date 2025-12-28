# Tier 3: Remove Unused Dependencies

> **STATUS: COMPLETED** - 2025-12-27
>
> **Commit**: `3b0b4a9` on branch `dev-integrity-npm-updates`
>
> **Results**:
> | Metric                   | Before           | After    |
> |--------------------------|------------------|----------|
> | Vulnerabilities          | 57 (37 critical) | **0**    |
> | Packages in node_modules | ~1000            | **282**  |
> | Packages removed         | -                | **717**  |
> | Tests passed             | -                | **730/730 golden + 7/7 multinode** |

**Risk Level**: None
**Effort**: Minimal
**Dependencies**: None (can be done independently)

## Overview

These packages are listed in `package.json` but are **not imported or used anywhere** in the codebase. Removing them will:
- Reduce `node_modules` size
- Eliminate security vulnerabilities from transitive dependencies
- Clean up the dependency tree

## Packages to Remove

| Package   | Current Version | Status                              | Security Impact           |
|-----------|-----------------|-------------------------------------|---------------------------|
| `request` | ^2.88.2         | Deprecated since Feb 2020           | Has known vulnerabilities |
| `update`  | ^0.7.4          | Unused, brings critical vulnerabilities | Critical CVEs via transitive deps |

---

## Package 1: request

### Deprecation Notice

The `request` package was officially deprecated in February 2020. From the maintainers:

> "request has been deprecated, see https://github.com/request/request/issues/3142"

### Usage Verification

Search confirmed no imports in the codebase:

```bash
# This search returned no results
grep -r "from ['\"]request['\"]" --include="*.ts" --include="*.mts" --include="*.js" --include="*.mjs" .
grep -r "require(['\"]request['\"])" --include="*.ts" --include="*.mts" --include="*.js" --include="*.mjs" .
```

### Why It Might Have Been Added

Likely added for HTTP requests in earlier development but replaced with native `fetch` or other solutions.

---

## Package 2: update

### Usage Verification

Search confirmed no imports in the codebase:

```bash
# This search returned no results
grep -r "from ['\"]update['\"]" --include="*.ts" --include="*.mts" --include="*.js" --include="*.mjs" .
grep -r "require(['\"]update['\"])" --include="*.ts" --include="*.mts" --include="*.js" --include="*.mjs" .
```

### Security Vulnerabilities

The `update` package brings in transitive dependencies with **critical security vulnerabilities**:

From `npm audit`:
- `assemble-core`: critical
- `base`: critical
- `base-argv`: critical
- `base-cli`: critical
- `base-cli-process`: critical
- `base-cli-schema`: critical
- `base-config-process`: critical
- `base-config-schema`: critical
- `base-generators`: critical
- `base-option`: critical
- Multiple others...

---

## Execution Steps

### Step 1: Verify Packages Are Unused

```bash
cd /Users/aslan/Prime/Troupe

# Double-check no usage of request
grep -r "request" rt/src --include="*.mts" --include="*.ts" | grep -v "//" | grep "import\|require"

# Double-check no usage of update
grep -r "update" rt/src --include="*.mts" --include="*.ts" | grep -v "//" | grep "import\|require"
```

### Step 2: Check Current Audit Status

```bash
npm audit
```

Note the number of vulnerabilities before removal.

### Step 3: Remove Packages

```bash
npm uninstall request update
```

### Step 4: Verify Removal

```bash
# Confirm packages are removed
npm ls request 2>&1 | grep -E "(empty|not found|missing)"
npm ls update 2>&1 | grep -E "(empty|not found|missing)"

# Check package.json no longer contains them
grep -E "\"request\"|\"update\"" package.json
```

### Step 5: Verify No Build Issues

```bash
make rt
```

### Step 6: Run Tests

```bash
make test
```

### Step 7: Check Audit Status After

```bash
npm audit
```

The critical vulnerabilities from `update`'s transitive dependencies should be resolved.

---

## Expected Changes

### package.json Before

```json
{
  "dependencies": {
    ...
    "request": "^2.88.2",
    "update": "^0.7.4",
    ...
  }
}
```

### package.json After

```json
{
  "dependencies": {
    ...
    // request and update lines removed
    ...
  }
}
```

---

## Rollback

If issues occur (unlikely since packages are unused):

```bash
npm install request@^2.88.2 update@^0.7.4
```

Or:

```bash
git checkout package.json package-lock.json
npm install
```

---

## Post-Removal Checklist

- [x] `request` removed from package.json
- [x] `update` removed from package.json
- [x] `npm ls request` shows package not found
- [x] `npm ls update` shows package not found
- [x] `make rt` completes successfully
- [x] `make test` passes all tests (730/730 golden, 7/7 multinode)
- [x] `npm audit` shows 0 vulnerabilities

---

## Alternative HTTP Libraries

If HTTP request functionality is needed in the future, consider these modern alternatives to `request`:

| Library      | Notes                                    |
|--------------|------------------------------------------|
| `node-fetch` | Fetch API for Node.js                    |
| `axios`      | Promise-based HTTP client                |
| `got`        | Human-friendly HTTP request library      |
| `undici`     | Fast HTTP/1.1 client (Node.js core team) |
| Native `fetch` | Available in Node.js 18+ natively       |

Since Troupe requires modern Node.js, native `fetch` is likely the best choice if HTTP functionality is needed.
