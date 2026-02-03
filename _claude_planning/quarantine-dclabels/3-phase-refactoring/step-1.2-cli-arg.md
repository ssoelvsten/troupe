# Step 1.2: Add CLI Argument for IntegrityOnlyDistrust

**Status**: COMPLETED

**Depends on**: Step 1.1

---

## Objective

Add a CLI argument `--integrity-only-distrust` that accepts values `raise_taint` or `quarantine`.

## Files to Modify

1. `rt/src/TroupeCliArgs.mts` - Add enum value
2. `rt/src/troupe.mts` - Parse the argument and configure

## Implementation

### 1. Modify TroupeCliArgs.mts

Add to the `TroupeCliArg` enum:
```typescript
export enum TroupeCliArg {
    // ... existing values
    IntegrityOnlyDistrust = 'integrity-only-distrust'
}
```

### 2. Modify troupe.mts

Find the argument parsing section and add:
```typescript
import {
    IntegrityOnlyDistrustAction,
    setIntegrityOnlyDistrustAction
} from './QuarantineConfig.mjs';

// In argument parsing:
const integrityOnlyDistrust = argv['integrity-only-distrust'];
if (integrityOnlyDistrust) {
    if (integrityOnlyDistrust === 'raise_taint') {
        setIntegrityOnlyDistrustAction(IntegrityOnlyDistrustAction.RAISE_TAINT);
    } else if (integrityOnlyDistrust === 'quarantine') {
        setIntegrityOnlyDistrustAction(IntegrityOnlyDistrustAction.QUARANTINE);
    } else {
        console.error(`Invalid value for --integrity-only-distrust: ${integrityOnlyDistrust}`);
        console.error('Valid values: raise_taint, quarantine');
        process.exit(1);
    }
}
```

## Verification

```bash
make rt
node rt/built/troupe.mjs --help  # Should show new arg (if help implemented)
```

## Completion Checklist

- [x] TroupeCliArg enum updated
- [x] troupe.mts parses the argument
- [x] `make rt` succeeds
- [x] Mark this step COMPLETED in INDEX.md

## Notes

Completed 2026-01-24.
- Added `IntegrityOnlyDistrust` to enum, `ParsedArgs` interface, and yargs options in TroupeCliArgs.mts
- Used yargs `choices` for validation (raise_taint/quarantine)
- Default is 'quarantine' (safer option)
- Added import and configuration call in troupe.mts
