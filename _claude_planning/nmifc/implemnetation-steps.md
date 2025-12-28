To add support for NMIFC in Troupe, we will proceed as follows.

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

### Step 1.1: Add CLI flag for NMIFC mode

**Files to modify:**
- [TroupeCliArgs.mts](rt/src/TroupeCliArgs.mts)

**Changes:**
1. Add `Nmifc = 'nmifc'` to the `TroupeCliArg` enum
2. Add yargs configuration for the flag (default: `false` for backwards compatibility)
3. Later, we can flip the default to `true` and add `--disable-nmifc` flag

### Step 1.2: Thread NMIFC flag through the runtime

**Files to modify:**
- [Thread.mts](rt/src/Thread.mts) - Store `isNMIFC` from CLI args
- [RuntimeInterface.mts](rt/src/RuntimeInterface.mts) - Expose `isNMIFC` on runtime
- [runtimeMonitored.mts](rt/src/runtimeMonitored.mts) - Pass through to threads

**Changes:**
1. Read `--nmifc` flag in runtime initialization
2. Store as `runtime.isNMIFC` or similar
3. Make available to all downgrade operations

### Step 1.3: Wire NMIFC to value downgrading

**Files to modify:**
- [declassify.mts](rt/src/builtins/declassify.mts)

**Current state:**
```typescript
declassify = mkBase(downgrader(runtime, DowngradeDimension.CONFIDENTIALITY, false), "declassify")
endorse = mkBase(downgrader(runtime, DowngradeDimension.INTEGRITY, false), "endorse")
```

**Changes:**
Replace hardcoded `false` with `runtime.isNMIFC` (or similar accessor).

### Step 1.4: Wire NMIFC to blocking level downgrading

**Files to modify:**
- [Thread.mts](rt/src/Thread.mts) - `blockDeclassifyTo()`, `blockEndorseTo()`

**Current state:**
These call `_validateDowngradeOrThrow()` which uses `levels.okToDowngrade()`.
The NMIFC parameter needs to be threaded through.

**Changes:**
1. Pass `this.isNMIFC` to the validation function
2. Update `_validateDowngradeOrThrow()` signature if needed

---

## Phase 2: Cross-Dimensional Downgrade Primitives

### Step 2.1: Add `downgrade` primitive (compiler)

**Files to modify:**
- [IR.hs](compiler/src/IR.hs) - Add `"downgrade"` to built-in list

**Purpose:** General downgrade that can change both confidentiality and integrity.

### Step 2.2: Implement `downgrade` primitive (runtime)

**Files to create:**
- `rt/src/builtins/downgrade.mts` (new file)

**Signature:**
```troupe
downgrade (value, authority, targetLabel)
```

**Implementation:**
1. Extract current level from value
2. Check both declassification and endorsement are valid
3. If NMIFC mode, check robustness and transparency
4. Return value with new label

### Step 2.3: Add `blockdownto` primitive (compiler + runtime)

**Files to modify:**
- [IR.hs](compiler/src/IR.hs) - Add `"blockdownto"` to built-in list
- [pini.mts](rt/src/builtins/pini.mts) or new file - Implementation

**Purpose:** Cross-dimensional downgrade for blocking level.

### Step 2.4: Add `blockdown` primitive (compiler + runtime)

**Purpose:** Downgrade blocking level to current PC label (convenience wrapper).

### Step 2.5: Mailbox clearance downgrading primitives

**Current state:** Only `lowermbox` and `raisembox` exist. The current
`lowermbox` only supports confidentiality dimension and uses the generic
name "lower" rather than "declassify".

**Files to modify:**
- [Thread.mts](rt/src/Thread.mts) - `lowerMboxClearance()`
- [IR.hs](compiler/src/IR.hs) - Add new primitives to built-in list
- [mboxclear.mts](rt/src/builtins/mboxclear.mts) - Implement new primitives

**New primitives needed:**
- `mboxdownto` - General mailbox clearance downgrade (cross-dimensional)
- Wire NMIFC parameter to existing `lowermbox` operation
- Consider integrity-dimension primitives if needed

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
| Error formatters             | `DowngradeFormatter.mts:52,60`           | ✓ Done  |
| Test infrastructure          | `_experiments/test-reflection.mts`       | ✓ Done  |

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