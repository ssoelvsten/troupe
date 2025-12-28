# Tier 1: Zero Intervention Updates

> **STATUS: COMPLETED** - 2025-12-27
>
> **Commit**: `ab1ab29` on branch `dev-integrity-npm-updates`
>
> **Results**: All 730 golden tests + 7 multinode tests passed.

**Risk Level**: None
**Effort**: Minimal
**Dependencies**: None

## Overview

These packages are within their semver range (`^` prefix in package.json) and can be updated automatically with `npm update`. No code changes are required.

## Packages to Update

| Package                     | Current   | Wanted    | Latest    | Change Type |
|-----------------------------|-----------|-----------|-----------|-------------|
| `@chainsafe/libp2p-noise`   | 16.1.4    | 16.1.5    | 17.0.0    | Patch       |
| `@libp2p/crypto`            | 5.1.8     | 5.1.13    | 5.1.13    | Patch       |
| `@types/yargs`              | 17.0.33   | 17.0.35   | 17.0.35   | Patch       |
| `@types/node`               | 22.15.21  | 22.19.3   | 25.0.3    | Minor       |
| `chalk`                     | 5.4.1     | 5.6.2     | 5.6.2     | Minor       |
| `winston`                   | 3.17.0    | 3.19.0    | 3.19.0    | Minor       |
| `rollup`                    | 4.41.0    | 4.54.0    | 4.54.0    | Minor       |
| `typescript`                | 5.8.3     | 5.9.3     | 5.9.3     | Minor       |

## Execution Steps

### Step 1: Verify Current State

```bash
cd /Users/aslan/Prime/Troupe
npm outdated
```

### Step 2: Run Update

```bash
npm update
```

### Step 3: Verify Installation

```bash
npm ls @chainsafe/libp2p-noise @libp2p/crypto @types/yargs @types/node chalk winston rollup typescript
```

### Step 4: Rebuild Runtime

```bash
make rt
```

### Step 5: Run Tests

```bash
make test
```

## Expected Outcome

- `package-lock.json` will be updated with new versions
- No changes to `package.json` (versions already specified with `^`)
- All packages updated to their "wanted" versions

## Rollback

If issues occur:

```bash
git checkout package-lock.json
npm install
```

## Notes

- These are all patch or minor updates that should be backward compatible
- The `@types/node` update from 22.15.21 to 22.19.3 stays within the v22.x range specified in package.json
- `@chainsafe/libp2p-noise` has a major version available (17.0.0) but the update will only apply the patch (16.1.5) due to the `^16.1.0` constraint

## Verification Commands

After update, verify specific versions:

```bash
node -e "console.log(require('typescript/package.json').version)"
node -e "console.log(require('rollup/package.json').version)"
node -e "console.log(require('winston/package.json').version)"
```
