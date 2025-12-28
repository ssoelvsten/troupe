# Task: V1 Pretty Printing Runtime Option

## Source
`.experiments/whats-next.md` line 110:
> "Provide a runtime option to NOT use V1 compatible pretty printing"

## Objective

Add a CLI flag `--no-v1-labels` (or `--v1-labels=false`) to allow users to disable V1-compatible label output format.

**V1 format:** `{alice}` (curly braces)
**New format:** `<alice ; alice>` (angle brackets with explicit conf/integ components)

---

## Background

The runtime currently uses V1-compatible output (`{}` delimiters) for backward compatibility with the old label syntax. The new DC label format uses `<>` delimiters with explicit confidentiality and integrity components.

Current behavior in `stringRep()`:
- Uses `{}` delimiters for BOT, TOP, ROOT, and tagset-compatible labels
- Uses `<>` delimiters only for complex DC labels that aren't tagset-compatible

---

## Files to Modify

### 1. `/rt/src/TroupeCliArgs.mts`

**Add to enum (after line 21):**
```typescript
export enum TroupeCliArg {
    // ... existing ...
    NoColor = 'no-color',
    V1Labels = 'v1-labels',  // ADD THIS
}
```

**Add to interface (after line 41):**
```typescript
export interface ParsedArgs {
    // ... existing ...
    [TroupeCliArg.NoColor]?: boolean;
    [TroupeCliArg.V1Labels]?: boolean;  // ADD THIS
    [key: string]: any;
}
```

**Add option parsing (after line 76, before `.parseSync()`):**
```typescript
.option(TroupeCliArg.V1Labels, {
    type: 'boolean',
    default: true,  // V1 compatible by default
    describe: 'Use V1-compatible label format ({} instead of <>)'
})
```

---

### 2. `/rt/src/levels/DCLabels/dcl_pp_config.mts`

**Make delimiters configurable by adding getter functions:**

```typescript
import { getCliArgs, TroupeCliArg } from '../../TroupeCliArgs.mjs';

// Keep constants for reference
export const DC_DELIM_LEFT = "<"
export const DC_DELIM_RIGHT = ">"
export const DC_DELIM_LEFT_V1  = "{"
export const DC_DELIM_RIGHT_V1 = "}"

// Add function to get appropriate delimiters
export function getDelimiters() {
    const argv = getCliArgs();
    const useV1 = argv[TroupeCliArg.V1Labels] !== false;
    return {
        left: useV1 ? DC_DELIM_LEFT_V1 : DC_DELIM_LEFT,
        right: useV1 ? DC_DELIM_RIGHT_V1 : DC_DELIM_RIGHT,
        sep: DC_DELIM_SEP
    };
}
```

---

### 3. `/rt/src/levels/DCLabels/dclabel.mts`

**Update `stringRep()` method (lines 105-139):**

```typescript
import { getDelimiters, DC_DELIM_LEFT, DC_DELIM_RIGHT, DC_DELIM_SEP,
         DC_TRUST_ROOT, DC_IFC_TOP, DC_CONF_LITERALS, DC_INTG_LITERALS
       } from './dcl_pp_config.mjs';

// In the stringRep() method:
stringRep(): string {
    if (this._cachedStringRepresentation) {
        return this._cachedStringRepresentation
    }

    const delims = getDelimiters();

    if (this.flowsTo(IFC_BOT)) {
        this._cachedStringRepresentation = delims.left + delims.right
    } else if (IFC_TOP.flowsTo(this)) {
        this._cachedStringRepresentation = delims.left + DC_IFC_TOP + delims.right
    } else if (TRUST_ROOT.flowsTo(this) && this.flowsTo(TRUST_ROOT)) {
        this._cachedStringRepresentation = delims.left + DC_TRUST_ROOT + delims.right
    } else {
        let s = this.isTagsetCompatible()
        if (s) {
            this._cachedStringRepresentation = tagsetStringRep(s as Set<string>);
        } else {
            this._cachedStringRepresentation =
                DC_DELIM_LEFT +  // Always use <> for complex labels
                this.confidentiality.stringRep(DC_CONF_LITERALS) +
                DC_DELIM_SEP +
                this.integrity.stringRep(DC_INTG_LITERALS) +
                DC_DELIM_RIGHT
        }
    }

    return this._cachedStringRepresentation;
}
```

**Important consideration:** The cached string representation is computed once. If the flag could change during execution, the cache would need to be invalidated. Since CLI args are parsed once at startup, this isn't an issue.

---

## Example Output

**With `--v1-labels` (default):**
```
>>> Main thread finished with value: 0@{}%{}
>>> value "alice"@{alice}%{alice}
```

**With `--no-v1-labels` (or `--v1-labels=false`):**
```
>>> Main thread finished with value: 0@<>%<>
>>> value "alice"@<alice ; alice>%<alice ; alice>
```

---

## Verification Steps

1. Build the runtime:
   ```bash
   make rt
   ```

2. Test default behavior (V1 format):
   ```bash
   ./local.sh tests/rt/pos/core/hello.trp
   # Should show {} format
   ```

3. Test with flag disabled:
   ```bash
   ./local.sh tests/rt/pos/core/hello.trp --v1-labels=false
   # Should show <> format
   ```

4. Run full test suite:
   ```bash
   make test
   ```

## Notes

- Default is `true` (V1 compatible) to maintain backward compatibility
- The `--no-v1-labels` shorthand should work via yargs negation handling
- Consider updating documentation/user guide about the new option
- Tagset-compatible labels may still use the compact format regardless of flag (design decision)

---

## Status: Complete

**Completed:** 2025-12-27

### Files Modified

| File | Change |
|------|--------|
| `rt/src/TroupeCliArgs.mts` | Added `V1Labels` CLI option (default: `true`) |
| `rt/src/levels/DCLabels/dcl_pp_config.mts` | Added `getDelimiters()` function |
| `rt/src/levels/DCLabels/dclabel.mts` | Updated `stringRep()` to use configurable delimiters |
| `rt/src/levels/tagsets.mts` | Updated `stringRep()` to accept optional delimiter params |
| `local.sh` | Pass `--v1-labels`/`--no-v1-labels` to runtime |
| `network.sh` | Pass `--v1-labels`/`--no-v1-labels` to runtime |
| `pini.sh` | Pass `--v1-labels`/`--no-v1-labels` to runtime |
| `scripts/troupe-common.sh` | Added shared `troupe_parse_args()` function (renamed from `troupe-env.sh`) |

### Usage

```bash
# Default (V1 format with {})
./local.sh program.trp
# Output: "value"@{alice}%{}

# New format with <>
./local.sh program.trp --no-v1-labels
# Output: "value"@<alice>%<>
```

### Verification

- All 742 golden tests pass
- Both `--v1-labels=false` and `--no-v1-labels` work correctly
