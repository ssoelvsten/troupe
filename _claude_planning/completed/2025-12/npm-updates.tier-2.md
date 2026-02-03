# Tier 2: Minimal Intervention Updates

> **STATUS: COMPLETED** - 2025-12-27
>
> **Commit**: `c63738c` on branch `dev-integrity-npm-updates`
>
> **Results**: No code changes required. All 730 golden tests + 7 multinode tests passed.

**Risk Level**: Low
**Effort**: Low
**Dependencies**: Tier 1 should be completed first (recommended)

## Overview

These packages have major version updates available but have historically stable APIs. They require updating `package.json` and testing affected functionality.

## Packages to Update

| Package | Current | Latest | Type        |
|---------|---------|--------|-------------|
| `uuid`  | 11.1.0  | 13.0.0 | Runtime dep |
| `yargs` | 17.7.2  | 18.0.0 | Runtime dep |

---

## Package 1: uuid (11.1.0 → 13.0.0)

### Usage in Codebase

The `uuid` package is used in **8 files** for generating UUIDs:

| File                                    | Line | Usage                              |
|-----------------------------------------|------|------------------------------------|
| `rt/src/runId.mts`                      | 1    | `import { v4 as uuidv4} from 'uuid'` |
| `rt/src/Scheduler.mts`                  | 2    | `import { v4 as uuidv4} from 'uuid'` |
| `rt/src/Thread.mts`                     | 18   | `import { v4 as uuidv4} from 'uuid'` |
| `rt/src/p2p/p2p.mts`                    | 84   | `import {v4 as uuidv4} from 'uuid'`  |
| `rt/src/runtimeMonitored.mts`           | 3    | `import { v4 as uuidv4 } from 'uuid'` |
| `rt/src/builtins/levelops.mts`          | 4    | `import { v4 as uuidv4 } from 'uuid'` |
| `rt/src/dev/mod-tests/run_id.ts`        | 1    | `import { v4 as uuidv4} from 'uuid'` |
| `rt/src/UserRuntime.mts`                | 10   | `import { BuiltinMkUuid } from './builtins/mkuuid.mjs'` |

### API Compatibility

The `v4` function signature has remained stable across versions. The primary usage pattern `uuidv4()` should work without changes.

### Breaking Changes to Check

Review the uuid changelog for versions 12.x and 13.x:
- https://github.com/uuidjs/uuid/blob/main/CHANGELOG.md

Known potential issues:
- ESM/CJS module resolution changes
- Node.js version requirements may have increased

### Update Steps

1. Update package.json:
   ```json
   "uuid": "^13.0.0"
   ```

2. Install:
   ```bash
   npm install
   ```

3. Rebuild:
   ```bash
   make rt
   ```

4. Test UUID generation:
   ```bash
   ./local.sh tests/rt/pos/core/simple.trp
   ```

5. Run full test suite:
   ```bash
   make test
   ```

---

## Package 2: yargs (17.7.2 → 18.0.0)

### Usage in Codebase

The `yargs` package is used in **6 files** for CLI argument parsing:

| File                              | Lines  | Usage                                      |
|-----------------------------------|--------|--------------------------------------------|
| `rt/src/TroupeCliArgs.mts`        | 1-2    | Main runtime CLI argument parsing          |
| `p2p-tools/relay/relay.mts`       | 16-17  | Relay server CLI                           |
| `p2p-tools/relay/relay.mjs`       | 16-17  | Relay server CLI (compiled)                |
| `p2p-tools/mkid.mts`              | 12-13  | ID generation tool CLI                     |
| `p2p-tools/mkaliases.ts`          | 17-18  | Alias management tool CLI                  |
| `rt/src/dev/relay.ts`             | 14     | Development relay CLI                      |

### Common Import Pattern

All files use the same import pattern:
```typescript
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
```

### Breaking Changes to Check

Review yargs v18 changelog:
- https://github.com/yargs/yargs/blob/main/CHANGELOG.md

Potential breaking changes in yargs 18:
- Minimum Node.js version requirements
- Changes to TypeScript types
- Possible API deprecations

### Update Steps

1. Update package.json:
   ```json
   "yargs": "^18.0.0"
   ```

2. Install:
   ```bash
   npm install
   ```

3. Rebuild:
   ```bash
   make rt
   ```

4. Test CLI argument parsing:
   ```bash
   # Test main runtime CLI
   ./local.sh --help

   # Test with actual program
   ./local.sh tests/rt/pos/core/simple.trp

   # Test relay CLI (if applicable)
   node p2p-tools/relay/relay.mjs --help
   ```

5. Run full test suite:
   ```bash
   make test
   ```

---

## Combined Update Approach

If updating both packages together:

### Step 1: Update package.json

Change:
```json
"uuid": "^11.1.0",
"yargs": "^17.7.2"
```

To:
```json
"uuid": "^13.0.0",
"yargs": "^18.0.0"
```

### Step 2: Install and Rebuild

```bash
npm install
make rt
```

### Step 3: Verification

```bash
# Verify versions
npm ls uuid yargs

# Test runtime
./local.sh tests/rt/pos/core/simple.trp

# Test CLI help
./local.sh --help

# Full test suite
make test
```

## Rollback

If issues occur:

```bash
# Revert package.json changes
git checkout package.json package-lock.json
npm install
make rt
```

## Post-Update Checklist

- [ ] `uuid` version verified as 13.x
- [ ] `yargs` version verified as 18.x
- [ ] Runtime builds without errors
- [ ] `./local.sh --help` works correctly
- [ ] `./local.sh tests/rt/pos/core/simple.trp` executes successfully
- [ ] `make test` passes all tests
- [ ] No TypeScript compilation errors
