To add support for NMIFC in Troupe, we will proceed as follows.

---

## Current Status (as of 2025-12-28)

**Phase 1: COMPLETE** - NMIFC enforcement is fully wired up and can be enabled via `--nmifc` CLI flag.

Key files modified in Phase 1:
- [TroupeCliArgs.mts](rt/src/TroupeCliArgs.mts) - Added `--nmifc` flag
- [Thread.mts](rt/src/Thread.mts) - Exposes `isNmifcMode` getter, wires NMIFC to blocking level downgrades, passes `pcLevel` to downgrade validation
- [downgrading.mts](rt/src/downgrading.mts) - Reads NMIFC flag from `runtime.$t.isNmifcMode`
- [declassify.mts](rt/src/builtins/declassify.mts) - Uses updated downgrader
- [DowngradeEnums.mts](rt/src/DowngradeEnums.mts) - Added `pcLevel?: Level` to `ValidateDowngradeParams`
- [DowngradeFormatter.mts](rt/src/DowngradeFormatter.mts) - Error messages show corruption status; uses context-aware labels ("current blocking level" vs "level of the data") based on `DowngradeKind`
- [troupe-common.sh](scripts/troupe-common.sh) - Recognizes `--nmifc` and `--no-nmifc` flags

Tests created in Phase 1:
- **Value downgrade tests:**
  - `tests/rt/neg/ifc/nmifc/robust-corrupt-label.trp` - Robustness violation (declassify)
  - `tests/rt/neg/ifc/nmifc/transp-corrupt-label.trp` - Transparency violation (endorse)
  - `tests/rt/pos/ifc/nmifc/symmetric-label-ok.trp` - Non-corrupt labels pass
  - `tests/rt/pos/ifc/nmifc/contrast-corrupt-decl-no-nmifc.trp` - Contrast test for declassify
  - `tests/rt/pos/ifc/nmifc/contrast-corrupt-endorse-no-nmifc.trp` - Contrast test for endorse
- **Blocking level downgrade tests:**
  - `tests/rt/neg/ifc/nmifc/block-robust-corrupt-label.trp` - Robustness violation (blockdeclto)
  - `tests/rt/neg/ifc/nmifc/block-transp-corrupt-label.trp` - Transparency violation (blockendorseto)
  - `tests/rt/pos/ifc/nmifc/contrast-block-decl-no-nmifc.trp` - Contrast test for blockdeclto
  - `tests/rt/pos/ifc/nmifc/contrast-block-endorse-no-nmifc.trp` - Contrast test for blockendorseto

**Next:** Phase 2 - Cross-dimensional downgrade primitives

---

# cross-dimensional downgrading

1. We will create a set of primitives for cross-dimensional downgrading

- `downgrade`, for general downgrading of values
- `blockdownto`, for general downgrading of the blocking level (that
- `blockdown`, for downgrading to the current pc label
  takes the target label just like `blockdeclto`)
- an appropirately named primitives for downgrading mailbox clearances

2. We will parameterize the system based on whether it is running in the
   NMIFC-enforcing mode or not.

This needs to be added to Troupe CLI as a flag; in the future, by
defalut we will make it that nmifc is enforced, and there will be a
special flag, something like `disable-nmifc` (or something appropriate
based on the CLI library we are using) that will turn it off. 

3. (optional stretch goal): disable downgrading with root authority

We may want to consider adding one more default to the system, which is
means that the authority for downgrading must be appropriately
that by default root authority cannot be used for downgrading, which
attenuated.

This will break many existing tests, and we will therefore need to be
careful with rolling this out.

something like, `allow-root-authority-downgrades` For existing tests, we
We should also extend Troupe CLI to disable this, by adding a flag,
will need to either 1) add option configuration

that will inform the test engine to allow root authority downgrades or
2) rewrite them to use the attenuated authority.

4. We will keep the single-dimensional separate primitives for
declassification and endorsement, both for backwards compatibility and
also for helping people make better sense of their code. 

5. We will create a standard library function (maybe in a new module
called nmifc) for assisted nmifc downgrading that will have the form of
`nmifc-dc (f, a, b, t, ...)` where f is function of two arguments that
computes on untrusted data, and `a` and `b` correspond to arguments that
are at mutually distrustful levels, `t` is the trusted label, and then
the rest of the arguments include the other necessary ingredients, e.g.,
the necessary authority (and/or levels), etc. We may want to iterate
over the exact signature of this function, e.g., use records if we say
an emerging pattern for better usability. The crux of this is that this
library function will perform the necessary combination of preventive
downgrading using the trust anchoring pattern described in
`nmifc-summary.md` and `trust-dg.md` on the information `a` and `b` and
return the result of running that function that should be flowing to
`t`. 

# Detailed Implementation Plan

Based on codebase exploration, the NMIFC infrastructure is largely in place but not
wired up. Here's the detailed implementation plan:

---

## Phase 1: Enable NMIFC via CLI Flag (No Breaking Changes)

### Step 1.1: Add CLI flag for NMIFC mode ✓ COMPLETE

**Files modified:**
- [TroupeCliArgs.mts](rt/src/TroupeCliArgs.mts)

**Changes made:**
1. Added `Nmifc = 'nmifc'` to the `TroupeCliArg` enum
2. Added yargs configuration for the flag (default: `false` for backwards compatibility)
3. Later, we can flip the default to `true` and add `--disable-nmifc` flag

### Step 1.2: Thread NMIFC flag through the runtime ✓ COMPLETE

**Actual implementation approach:**
Rather than adding `isNMIFC` to `RuntimeInterface`, we leveraged the existing architecture:
- [Thread.mts](rt/src/Thread.mts) already reads `isNmifcMode` from CLI args at module level (line 30)
- Thread class exposes `isNmifcMode` as a getter (lines 189-191)
- Since `runtime.$t` (the Thread) is accessible in downgrade operations, we read `isNmifcMode` from there

This approach is cleaner because:
- No need to modify `RuntimeInterface`
- The flag flows naturally from the Thread which already has it
- Less parameter passing

### Step 1.3: Wire NMIFC to value downgrading ✓ COMPLETE

**Files modified:**
- [downgrading.mts](rt/src/downgrading.mts) - Removed `isNMIFC` parameter, now reads from `runtime.$t.isNmifcMode`
- [declassify.mts](rt/src/builtins/declassify.mts) - Removed hardcoded `false` parameter

**Changes made:**
- `downgrader()` signature changed from `(runtime, dimension, isNMIFC)` to `(runtime, dimension)`
- `isNMIFC` is now read from `runtime.$t.isNmifcMode` inside the function

### Step 1.4: Wire NMIFC to blocking level downgrading ✓ COMPLETE

**Files modified:**
- [Thread.mts](rt/src/Thread.mts) - `_validateDowngradeOrThrow()` method

**Changes made:**
- `_validateDowngradeOrThrow()` now passes `this.isNmifcMode` and `this.pc` to `levels.okToDowngrade()`
- This enables NMIFC checks (robustness/transparency) for blocking level downgrades

**Note:** The `okToDowngradeGeneric` signature in dclabel.mts was also updated to change the default `pc` parameter from `TRUST_NULL` to `null`

---

## Phase 2: Cross-Dimensional Downgrade Primitives

### Background

Currently, Troupe has separate primitives for single-dimension downgrades:
- `declassify(value, authority, targetLabel)` - changes confidentiality only (integrity must match)
- `endorse(value, authority, targetLabel)` - changes integrity only (confidentiality must match)
- `blockdeclto(authority, targetLevel)` - declassifies blocking level
- `blockendorseto(authority, targetLevel)` - endorses blocking level

Phase 2 adds cross-dimensional primitives that can change both dimensions atomically.

### Key Implementation Patterns

**Adding a new built-in function requires changes in two places:**

1. **Compiler** - Register in [IR.hs](compiler/src/IR.hs) around line 262-337:
   ```haskell
   wfir (Base fname) =
       if  fname `elem`[
           -- ... existing built-ins ...
           , "yourNewFunction"  -- Add here
           ]
   ```

2. **Runtime** - Create/modify a builtin file and register in [UserRuntime.mts](rt/src/UserRuntime.mts):
   ```typescript
   // In rt/src/builtins/yourFunction.mts:
   import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'

   export function BuiltinYourFunction<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
       return class extends Base {
           yourFunction = mkBase((arg) => {
               // Implementation here
               return this.runtime.ret(result);
           }, "yourFunction")
       }
   }

   // In UserRuntime.mts - add to the composition chain:
   import { BuiltinYourFunction } from './builtins/yourFunction.mjs'
   export const UserRuntime = BuiltinYourFunction( ... existing chain ... )
   ```

**Reference implementation:** See [declassify.mts](rt/src/builtins/declassify.mts) and [downgrading.mts](rt/src/downgrading.mts) for the pattern used by `declassify` and `endorse`.

### Step 2.1: Add `downgrade` primitive (compiler)

**Files to modify:**
- [IR.hs](compiler/src/IR.hs) - Add `"downgrade"` to built-in list (around line 284, near `declassify`)

### Step 2.2: Implement `downgrade` primitive (runtime)

**Files to create:**
- `rt/src/builtins/downgrade.mts` (new file)

**Files to modify:**
- [UserRuntime.mts](rt/src/UserRuntime.mts) - Import and add to composition chain

**Troupe signature:**
```troupe
downgrade (value, authority, targetLabel)
```

**Semantics:**
- Unlike `declassify`/`endorse`, `downgrade` allows changing BOTH confidentiality and integrity
- Both the declassification check AND endorsement check must pass
- If NMIFC mode is enabled, both robustness AND transparency checks must pass
- If either check fails, the entire operation fails (atomic)

**Implementation outline:**
```typescript
// In rt/src/builtins/downgrade.mts
import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { LCopyVal } from '../Lval.mjs';
import { assertIsNTuple, assertIsAuthority, assertIsLevel } from '../Asserts.mjs'
import { lub, okToDeclassify, okToEndorse } from '../Level.mjs'
import { DowngradeResult, DowngradeErrorReason } from '../DowngradeEnums.mjs';
// ... import formatters ...

export function BuiltinDowngrade<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        downgrade = mkBase((arg) => {
            assertIsNTuple(arg, 3);
            let argv = arg.val;
            let data = argv[0];
            let auth = argv[1];
            assertIsAuthority(auth);
            let toLevV = argv[2];
            assertIsLevel(toLevV);

            let pc = this.runtime.$t.pc;
            let levFrom = data.lev;
            let bl = this.runtime.$t.bl;
            let isNMIFC = this.runtime.$t.isNmifcMode;
            let lev_to = toLevV.val;

            // Check BOTH dimensions (no dimension mismatch checks needed)
            // 1. Check declassification is valid
            const declResult = okToDeclassify(levFrom, lev_to, auth.val.authorityLevel, bl, isNMIFC, pc);
            if (declResult.kind === "FAILURE") {
                // Handle error - but skip INTEGRITY_MISMATCH since we allow cross-dimensional
                if (declResult.reason !== DowngradeErrorReason.INTEGRITY_MISMATCH) {
                    this.runtime.$t.threadError(/* format error */);
                }
            }

            // 2. Check endorsement is valid
            const endResult = okToEndorse(levFrom, lev_to, auth.val.authorityLevel, bl, isNMIFC, pc);
            if (endResult.kind === "FAILURE") {
                // Handle error - but skip CONFIDENTIALITY_MISMATCH since we allow cross-dimensional
                if (endResult.reason !== DowngradeErrorReason.CONFIDENTIALITY_MISMATCH) {
                    this.runtime.$t.threadError(/* format error */);
                }
            }

            // Both passed - return downgraded value
            let r = new LCopyVal(data, lub(lev_to, pc, arg.lev, auth.lev));
            return this.runtime.ret(r);
        }, "downgrade")
    }
}
```

**Note:** The implementation needs careful handling of the dimension mismatch errors since cross-dimensional downgrades intentionally allow both dimensions to change.

### Step 2.3: Add `blockdownto` primitive (compiler + runtime)

**Files to modify:**
- [IR.hs](compiler/src/IR.hs) - Add `"blockdownto"` to built-in list
- [pini.mts](rt/src/builtins/pini.mts) - Add implementation (follows pattern of `blockdeclto`/`blockendorseto`)

**Troupe signature:**
```troupe
blockdownto (authority, targetLevel)
```

**Semantics:**
- Downgrades the blocking level in both dimensions atomically
- Similar to `blockdeclto` + `blockendorseto` but in one operation
- Reference: See `blockDeclassifyTo()` and `blockEndorseTo()` in [Thread.mts](rt/src/Thread.mts)

### Step 2.4: Add `blockdown` primitive (compiler + runtime)

**Files to modify:**
- [IR.hs](compiler/src/IR.hs) - Add `"blockdown"` to built-in list
- [pini.mts](rt/src/builtins/pini.mts) - Add implementation

**Troupe signature:**
```troupe
blockdown (authority)
```

**Semantics:**
- Convenience wrapper: equivalent to `blockdownto(authority, getPC())`
- Downgrades blocking level to current PC label in both dimensions

### Step 2.5: Mailbox clearance downgrading primitives

**Current state:**
- `raisembox(level)` - raises mailbox clearance (returns capability)
- `lowermbox(capability, authority)` - lowers mailbox clearance (confidentiality only)

**Files to modify:**
- [IR.hs](compiler/src/IR.hs) - Add new primitives to built-in list
- [mboxclear.mts](rt/src/builtins/mboxclear.mts) - Implement new primitives
- [Thread.mts](rt/src/Thread.mts) - `lowerMboxClearance()` may need updating

**New primitives:**
- `mboxdownto(capability, authority, targetLevel)` - Cross-dimensional mailbox clearance downgrade

**Note:** The existing `lowermbox` should also be updated to respect NMIFC mode (wire `isNmifcMode` through to the validation).

### Phase 2 Build & Test

After implementing each primitive:
```bash
make stack      # Rebuild compiler (only if IR.hs changed)
make rt         # Rebuild runtime
make test       # Run all tests
```

Create tests in `tests/rt/pos/ifc/nmifc/` for the new primitives (Category D tests from the demonstrator plan).

---

## Phase 3: (Stretch) Restrict Root Authority Downgrades

### Step 3.1: Add CLI flag to disable root authority downgrades

**Files to modify:**
- [TroupeCliArgs.mts](rt/src/TroupeCliArgs.mts)

**Add:** `--allow-root-authority-downgrades` flag (default: `false` in future)

### Step 3.2: Enforce restriction in downgrade operations

**Files to modify:**
- [dclabel.mts](rt/src/levels/DCLabels/dclabel.mts) - `okToDowngradeGeneric()`

**Changes:**
1. Add parameter for whether root authority is allowed
2. If not allowed and authority is ROOT, reject the downgrade
3. Requires users to explicitly attenuate authority

### Step 3.3: Update existing tests

**Options:**
1. Add test configuration to allow root authority (for legacy tests)
2. Rewrite tests to use attenuated authority

This is a breaking change and needs careful rollout.

---

## Phase 4: NMIFC Standard Library

### Step 4.1: Create `nmifc` library module

**Files to create:**
- `lib/nmifc.trp` (new file)

### Step 4.2: Implement `nmifc-dc` helper function

**Purpose:** Assisted NMIFC downgrading with trust anchor pattern.

**Signature (draft):**
```troupe
nmifc-dc { f = fn,
           a = valueA,
           b = valueB,
           t = trustLabel,
           auth = authority }
```

**Implementation:**
1. Perform preventive downgrading on `a` and `b` using trust anchor `t`
2. Compute `a ⊓ t` and `b ⊓ t`
3. Run `f(a', b')`
4. Result flows to `t` safely

### Step 4.3: Add supporting utilities

- `isCorrupt` - Expose label corruption check to Troupe programs
- `reflection` - Expose reflection operation
- `trustAnchorMeet` - Helper for the meet operation with trust anchors

---

## Phase 5: Flip Defaults

After Phases 1-4 are stable and the ecosystem has had time to adapt:

### Step 5.1: Make NMIFC enforcement the default

**Changes:**
1. Change `--nmifc` default from `false` to `true`
2. Add `--no-nmifc` or `--disable-nmifc` flag for opting out
3. Update documentation to reflect new defaults

### Step 5.2: (If Phase 3 completed) Make root authority restriction the default

**Changes:**
1. Change `--allow-root-authority-downgrades` default from `true` to `false`
2. Ensure all standard tests work with attenuated authority
3. Provide migration guide for users

---

## Implementation Order and Dependencies

```
Phase 1: CLI + Wiring (no breaking changes)
  └── 1.1 → 1.2 → 1.3, 1.4 (can be parallel)

Phase 2: New Primitives (backwards compatible additions)
  └── 2.1 → 2.2 (downgrade)
  └── 2.3, 2.4 (blockdownto, blockdown)
  └── 2.5 (mailbox primitives, includes NMIFC wiring)

Phase 3: Root Authority Restriction (breaking, needs migration)
  └── 3.1 → 3.2 → 3.3

Phase 4: Standard Library (depends on Phase 1, 2)
  └── 4.1 → 4.2 → 4.3

Phase 5: Flip Defaults (after ecosystem adapts)
  └── 5.1 (NMIFC default on)
  └── 5.2 (Root authority restriction default on, if Phase 3 done)
```

---

## Cross-Cutting Concern: NMIFC Demonstrator Tests

Throughout all phases, we will develop and curate a set of demonstrator tests that
showcase when NMIFC checks kick in and why they are needed. These tests serve both
as regression tests and as educational material for users.

### Purpose

1. **Illustrate attack scenarios** that NMIFC prevents
2. **Demonstrate the security guarantees** of robust declassification and transparent endorsement
3. **Provide reference implementations** for common NMIFC patterns
4. **Document the trust anchor pattern** with concrete examples

### Test Categories

#### Category A: Robustness Violation Demonstrations

Tests showing how untrusted code could influence declassification without NMIFC:

| Test                          | Scenario                                                    | Expected Behavior          |
|-------------------------------|-------------------------------------------------------------|----------------------------|
| `robust-01-attacker-influence.trp` | Attacker controls PC, tries to declassify secret        | NMIFC rejects, non-NMIFC allows |
| `robust-02-corrupt-label.trp`      | Declassify from corrupt label `{alice,bob}`             | NMIFC rejects              |
| `robust-03-low-integrity-pc.trp`   | Declassify with `pc = TRUST_NULL`                       | NMIFC rejects              |

#### Category B: Transparency Violation Demonstrations

Tests showing how public code could covertly boost integrity without NMIFC:

| Test                          | Scenario                                                    | Expected Behavior          |
|-------------------------------|-------------------------------------------------------------|----------------------------|
| `transp-01-public-endorse.trp`    | Public code endorses secret untrusted data               | NMIFC rejects              |
| `transp-02-covert-boost.trp`      | Attempt to launder integrity via public context          | NMIFC rejects              |

#### Category C: Trust Anchor Pattern Demonstrations

Tests showing the correct way to handle mutually distrustful data:

| Test                          | Scenario                                                    | Expected Behavior          |
|-------------------------------|-------------------------------------------------------------|----------------------------|
| `anchor-01-direct-join.trp`       | Direct join of `{alice}` and `{bob}` creates corruption  | Demonstrates corruption    |
| `anchor-02-anchored-join.trp`     | Meet with trust anchor before join preserves non-corruption | NMIFC allows            |
| `anchor-03-downgrade-path.trp`    | Step-by-step downgrade from `a` to `a ⊓ t'`              | Shows authority requirements |

#### Category D: Cross-Dimensional Downgrade Demonstrations

Tests for the new `downgrade`, `blockdownto`, etc. primitives:

| Test                          | Scenario                                                    | Expected Behavior          |
|-------------------------------|-------------------------------------------------------------|----------------------------|
| `crossdim-01-basic.trp`           | Basic cross-dimensional downgrade                        | Works with proper authority |
| `crossdim-02-atomic-failure.trp`  | One dimension check fails                                | Entire operation fails     |
| `crossdim-03-blocking.trp`        | Cross-dimensional blocking level downgrade               | Works correctly            |

#### Category E: Contrast Tests (NMIFC vs Non-NMIFC)

Tests that run both with and without `--nmifc` to show the difference:

| Test                          | Without NMIFC                | With NMIFC                   |
|-------------------------------|------------------------------|------------------------------|
| `contrast-01-corrupt-decl.trp`    | Succeeds (potentially unsafe) | Fails (robustness violation) |
| `contrast-02-public-endorse.trp`  | Succeeds (potentially unsafe) | Fails (transparency violation) |

### Test Location

All demonstrator tests will be placed in:
```
tests/rt/pos/ifc/nmifc/
├── robust/          # Robustness violation tests
├── transparent/     # Transparency violation tests
├── anchor/          # Trust anchor pattern tests
├── crossdim/        # Cross-dimensional downgrade tests
└── contrast/        # NMIFC vs non-NMIFC comparison tests
```

### Documentation

Each test file should include:
1. **Header comment** explaining the security scenario
2. **Expected output** for both NMIFC and non-NMIFC modes (where applicable)
3. **Reference** to the relevant section in `nmifc-summary.md` or `trust-dg.md`

### Phase Integration

| Phase   | Demonstrator Tests to Add                                      |
|---------|----------------------------------------------------------------|
| Phase 1 | Categories A, B, E (basic robustness/transparency/contrast)    |
| Phase 2 | Category D (cross-dimensional primitives)                      |
| Phase 3 | Tests showing root authority restriction                       |
| Phase 4 | Category C (trust anchor pattern with library helpers)         |

---

## Testing Strategy

### Phase 1 Tests
- Create tests in `tests/rt/pos/ifc/nmifc/` subdirectory
- Test NMIFC enforcement with `--nmifc` flag
- Verify existing tests still pass without the flag
- **Add demonstrator tests from Categories A, B, E**

### Phase 2 Tests
- Test `downgrade`, `blockdownto`, `blockdown` primitives
- Test cross-dimensional scenarios
- **Add demonstrator tests from Category D**

### Phase 3 Tests
- Test root authority rejection
- Migration path for existing tests
- **Add demonstrator tests showing root authority restriction**

### Phase 4 Tests
- Test library functions
- Test trust anchor patterns end-to-end
- **Add demonstrator tests from Category C**

---

## Existing Infrastructure (No Changes Needed)

The following are already implemented and working:

| Component                    | Location                                 | Status  |
|------------------------------|------------------------------------------|---------|
| `reflection()` method        | `dclabel.mts:189`                        | ✓ Done  |
| `isCorrupt()` method         | `dclabel.mts:197`                        | ✓ Done  |
| NMIFC checks in downgrader   | `dclabel.mts:277-368`                    | ✓ Done  |
| `ROBUSTNESS_VIOLATION` error | `DowngradeEnums.mts:20`                  | ✓ Done  |
| `TRANSPARENCY_VIOLATION` err | `DowngradeEnums.mts:21`                  | ✓ Done  |
| Error formatters             | `DowngradeFormatter.mts:56,64`           | ✓ Done  |
| Context-aware labels         | `DowngradeFormatter.mts:52-54`           | ✓ Done  |
| Test infrastructure          | `_experiments/test-reflection.mts`       | ✓ Done  |

**Error Message Enhancement**: The `formatRobustnessViolationMsg` and `formatTransparencyViolationMsg` functions now take a `DowngradeKind` parameter and display context-appropriate labels:
- For `DowngradeKind.BLOCKING`: Shows "current blocking level"
- For `DowngradeKind.VALUE`: Shows "level of the data"

---

## Questions - Resolved

1. **Default behavior**: Should `--nmifc` default to `true` or `false` initially?
   - **Resolution**: Start with `false` for backwards compatibility. Phase 5 added
     to explicitly flip defaults later.

2. **Cross-dimensional downgrade semantics**: Should `downgrade` require both
   checks to pass, or allow partial success?
   - **Clarification**: The `downgrade` primitive changes both confidentiality
     (declassification) and integrity (endorsement) in one operation. The question
     is whether we require:
     - The declassification authority check to pass, AND
     - The endorsement authority check to pass
   - **Resolution**: Both must pass (atomic operation). If either fails, the
     entire downgrade fails. This prevents partial state where only one dimension
     changed.

3. **Root authority timeline**: When should Phase 3 be activated?
   - **Resolution**: After Phase 1+2 are stable and tests migrated.

4. **`nmifc-dc` exact interface**: Use positional args or records?
   - **Resolution**: Deferred to Phase 4 implementation.

---

## Next Steps

Start with Phase 1, Step 1.1: Add the `--nmifc` CLI flag.