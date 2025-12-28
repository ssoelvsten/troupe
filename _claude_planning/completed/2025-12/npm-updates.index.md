# NPM Package Update Plan

This document outlines the plan for updating npm dependencies in the Troupe project, organized by the degree of intervention required.

## Overview

**Analysis Date**: 2025-12-27
**Branch**: `dev-integrity-npm-updates`
**Package File**: `/Users/aslan/Prime/Troupe/package.json`

## Summary Table

| Tier | Description                        | Packages | Risk Level | Status      |
|------|------------------------------------|----------|------------|-------------|
| 1    | Zero Intervention (npm update)     | 8        | None       | **Complete** |
| 2    | Minimal Intervention               | 2        | Low        | **Complete** |
| 3    | Remove Unused Dependencies         | 2        | None       | **Complete** |
| 4    | Deprecated Rollup Plugin Migration | 4        | Medium     | **Complete** |
| 5    | libp2p v3 Ecosystem Upgrade        | 15       | High       | Pending     |

## Tier Documentation

- [Tier 1: Zero Intervention Updates](./tier-1.md) - **COMPLETED** 2025-12-27
- [Tier 2: Minimal Intervention Updates](./tier-2.md) - **COMPLETED** 2025-12-27
- [Tier 3: Remove Unused Dependencies](./tier-3.md) - **COMPLETED** 2025-12-27
- [Tier 4: Rollup Plugin Migration](./tier-4.md) - **COMPLETED** 2025-12-27
- [Tier 5: libp2p v3 Migration](./tier-5.md) - Major networking stack upgrade

## Recommended Execution Order

1. **Tier 1** - Run `npm update` to get safe updates
2. **Tier 3** - Remove unused `request` and `update` packages (fixes security vulnerabilities)
3. **Tier 4** - Migrate rollup plugins (isolated to build system)
4. **Tier 2** - Update `uuid` and `yargs` (test CLI and runtime after)
5. **Tier 5** - libp2p v3 migration (largest effort, plan as separate project)

## Pre-Update Checklist

Before starting any updates:

1. Ensure all tests pass: `make test`
2. Ensure build works: `make all`
3. Create a backup branch or ensure you can revert
4. Have multinode test environment ready for Tier 5

## Post-Update Verification

After each tier:

1. Run `npm install` to verify dependency resolution
2. Run `make rt` to rebuild the runtime
3. Run `make test` to verify functionality
4. For Tier 5: Run multinode tests with `./scripts/run-multinode-tests.sh`

## Security Context

~~Current `npm audit` shows **critical vulnerabilities** stemming from the `update` package's transitive dependencies. Completing Tier 3 will resolve these vulnerabilities.~~

**RESOLVED**: Tier 3 completed on 2025-12-27. All 57 vulnerabilities (37 critical) have been eliminated. `npm audit` now shows 0 vulnerabilities.

## Files Modified

The main file modified across all tiers:
- `/Users/aslan/Prime/Troupe/package.json`

Additional files by tier:
- **Tier 4**: `/Users/aslan/Prime/Troupe/rollup.config.js`
- **Tier 5**: Multiple runtime files (see tier-5.md for complete list)
