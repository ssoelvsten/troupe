# Step 2.3: Add quarantineIntegrity() Method

**Status**: REMOVED

---

## Reason for Removal

This step was removed because it **contradicts the specification**.

From `.experiments/quarantine-high-level-description.md`:

> If the setting is `QUARANTINE`, then we quarantine both I and C **as in the full overclaim**.

The spec explicitly says that for integrity-only overclaim with QUARANTINE action, we should do **full quarantine** (both components), not partial quarantine.

The `quarantineIntegrity()` method would produce `<C, I@n:q>` (only I quarantined), but the spec requires `<C@n:q, I@n:q>` (both quarantined).

**Correct approach**: Use the existing `quarantine()` method for both `full_overclaim` and `integrity_overclaim` with QUARANTINE action.

## Original Implementation (Removed)

The method was briefly added and then removed from `dclabel.mts`. It should NOT be re-added.

## Notes

- Removed 2026-01-24 after spec review revealed the implementation contradicted the specification.
- The existing `quarantine()` method provides the correct full-quarantine behavior.
