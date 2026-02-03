# Phase 6: Restrict Root Authority Downgrades (Stretch)

**Status:** Pending (Stretch Goal)

**Purpose:** By default, root authority cannot be used for downgrading, requiring users to explicitly attenuate authority.

---

## Steps

### Step 6.1: Add CLI flag to disable root authority downgrades

**Files to modify:**
- [TroupeCliArgs.mts](../../rt/src/TroupeCliArgs.mts)

**Add:** `--allow-root-authority-downgrades` flag (default: `false` in future)

### Step 6.2: Enforce restriction in downgrade operations

**Files to modify:**
- [dclabel.mts](../../rt/src/levels/DCLabels/dclabel.mts) - `okToDowngradeGeneric()`

**Changes:**
1. Add parameter for whether root authority is allowed
2. If not allowed and authority is ROOT, reject the downgrade
3. Requires users to explicitly attenuate authority

### Step 6.3: Update existing tests

**Options:**
1. Add test configuration to allow root authority (for legacy tests)
2. Rewrite tests to use attenuated authority

This is a breaking change and needs careful rollout.

### Step 6.4: Make root authority restriction the default

**Changes:**
1. Change `--allow-root-authority-downgrades` default from `true` to `false`
2. Ensure all standard tests work with attenuated authority
3. Provide migration guide for users

---

## Testing Strategy

- Test root authority rejection
- Migration path for existing tests
- Add demonstrator tests showing root authority restriction
