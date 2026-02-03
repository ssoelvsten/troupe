# Wildcard False Label Implementation Plan

## Summary

We need to add a new label kind - **WildcardQFalse** - that represents a "wildcard" quarantine authority for a given node. Unlike the existing `QFalseLabel` which requires matching **both** nodeId and quarantineId, the wildcard version only requires matching the **nodeId**.

This enables a different approach to `actsFor` checks: instead of restoring quarantined labels, we coalesce with the wildcard authority for the target node.

## Design Decisions

- **WildcardQFalse is NOT serializable** - it is purely an internal construct for authority checks
- **No explicit mismatch handling** - the implication naturally fails when quarantined labels are from a different node
- **restoreCNFForNode remains for serialization** - actual label restoration during serialization still uses this method
- **Two-label tracking in serialization** - serialize accumulates two labels: one for restoration, one for actsFor check

## Current Implementation

### Label Hierarchy
```
Label (abstract)
├── RegularLabel        - principal name (e.g., "alice")
├── QuarantinedLabel    - principal@nodeId:quarantineId
├── QFalseLabel         - #false@nodeId:quarantineId
└── (NEW) WildcardQFalseLabel - #wildcard@nodeId (NOT serializable)
```

### Current Serialization Flow (runtimeMonitored.mts)
```typescript
// Line 83-88 (spawn) and 257-262 (send):
let { data, level } = serialize(f, lub($t().pc, ...), node.nodeId);
let trustLevel = nodeTrustLevel(node.nodeId);

if (!actsFor(trustLevel, level, { node: node.nodeId, allowMismatched: false })) {
    // error: illegal trust flow
}
```

### Problem with Current Approach

The `level` returned by `serialize` is accumulated via `lub(level, lval.lev)` during the walk. These levels contain quarantined labels. Currently:

1. `serializeLevel()` uses `restoreForNode()` to restore labels **for JSON output**
2. `actsFor()` with node option also uses `restoreCNFForNode()` internally

But the accumulated `level` that goes into `actsFor` check still has quarantined labels that weren't restored (only the JSON output was restored). This works because `actsFor` internally restores them, but conceptually we want:

- **Serialization**: Restore quarantined labels to their original form (for transmission)
- **ActsFor check**: Use coalescing with wildcard authority (no restoration)

## Proposed Design

### New Label Kind: `WildcardQFalseLabel`

A wildcard false label that implies any quarantined label (QuarantinedLabel or QFalseLabel) from the **same node**, regardless of quarantineId.

```typescript
enum LabelKind {
    REGULAR = 'regular',
    QUARANTINED = 'quarantined',
    QFALSE = 'qfalse',
    WILDCARD_QFALSE = 'wildcard_qfalse'  // NEW
}

class WildcardQFalseLabel extends Label {
    readonly kind = LabelKind.WILDCARD_QFALSE;
    readonly nodeId: string;  // Only nodeId, no quarantineId

    constructor(nodeId: string) { ... }

    stringRep(): string {
        return `#wildcard@${this.nodeId}`;
    }

    // NOT serializable - toJSON() throws error
    toJSON(): never {
        throw new Error("WildcardQFalseLabel cannot be serialized");
    }
}
```

### Updated `labelImplies` Semantics

```typescript
labelImplies(x: Label, y: Label): boolean
  - x.equals(y) → true
  - QFalse implies QuarantinedLabel with same (nodeId, quarantineId)
  - WildcardQFalse implies QuarantinedLabel with same nodeId (any quarantineId) // NEW
  - WildcardQFalse implies QFalseLabel with same nodeId (any quarantineId)      // NEW
  - otherwise → false
```

### New `actsFor` Logic

The new approach for `actsFor` when a node is provided:

```typescript
actsFor(other: DCLabel, options?: QuarantineOptions): boolean {
    if (!options) {
        // Original behavior - no node context
        return implies(this.confidentiality, other.confidentiality)
            && implies(this.integrity, other.integrity);
    }

    // NEW: Create wildcard authority for this node
    const wildcardAuth = createWildcardQuarantineAuthority(options.node);

    // Coalesce this label with the wildcard authority
    const coalescedThis = this.coalesce(wildcardAuth);

    // Check if coalesced label acts for other
    // No need to restore CNF - the wildcard handles all quarantined labels from this node
    // Labels from other nodes will cause implication to fail naturally
    return implies(coalescedThis.confidentiality, other.confidentiality)
        && implies(coalescedThis.integrity, other.integrity);
}
```

Note: The `allowMismatched` field in `QuarantineOptions` becomes obsolete with this approach - if there are quarantined labels from node X and we check with wildcard for node Y, the implication fails because WildcardQFalse@Y doesn't imply labels for node X.

### Factory Function

```typescript
export function createWildcardQuarantineAuthority(nodeId: string): DCLabel {
    const wildcard = new WildcardQFalseLabel(nodeId);
    const cat = new Category([wildcard]);
    const cnf = new CNF(new Set([cat]));
    return new DCLabel(cnf, cnf);
}
```

### Two-Label Tracking in Serialization

The key insight: we need to track **two different accumulated labels** during serialization:

1. **`level`** (existing): Used for `actsFor` check - keeps quarantined labels as-is
2. **Restored in `serializeLevel`**: The actual JSON output has labels restored via `restoreForNode`

Current code already does this correctly! The `level` variable accumulates the lub of all levels (with quarantined labels), while `serializeLevel()` restores them only for the JSON output. The `actsFor` check then uses the coalescing approach on the unrestored `level`.

**No changes needed in serialize.mts** - the current structure already separates:
- JSON output: restored via `serializeLevel()` → `restoreForNode()`
- ActsFor check: uses `level` directly with node option → coalescing with wildcard

The only change is in `actsFor()` implementation to use coalescing instead of restoration.

## Implementation Steps

### Step 1: Add `WildcardQFalseLabel` to `label.mts`

1. Add `WILDCARD_QFALSE = 'wildcard_qfalse'` to `LabelKind` enum
2. **Skip** adding to `LabelJSON` (not serializable)
3. Create `WildcardQFalseLabel` class extending `Label`:
   - Only stores `nodeId` (no `quarantineId`)
   - `toKey()`: `"W:${nodeId}"`
   - `stringRep()`: `"#wildcard@${nodeId}"`
   - `isQuarantined()`: returns `true`
   - `getQuarantineTag()`: returns `null` (no specific tag)
   - `toJSON()`: throws error (not serializable)
4. **Skip** adding case to `labelFromJSON` (cannot deserialize)
5. Update `labelImplies`:
   - Add: WildcardQFalse → QuarantinedLabel (same nodeId)
   - Add: WildcardQFalse → QFalseLabel (same nodeId)

### Step 2: Update `dclabel.mts`

1. Import `WildcardQFalseLabel`
2. Add `createWildcardQuarantineAuthority(nodeId: string): DCLabel` function
3. Modify `actsFor` to use the coalescing approach when `options` is provided:
   ```typescript
   if (options) {
       const wildcardAuth = createWildcardQuarantineAuthority(options.node);
       const coalescedThis = this.coalesce(wildcardAuth);
       return implies(coalescedThis.confidentiality, other.confidentiality)
           && implies(coalescedThis.integrity, other.integrity);
   }
   ```
4. Keep `restoreCNFForNode` and `restoreForNode` - still needed for actual serialization in `serialize.mts`
5. Consider removing or deprecating the `allowMismatched` field from `QuarantineOptions` since it's no longer used

### Step 3: Update QuarantineOptions Type

```typescript
export interface QuarantineOptions {
    /** The target node ID for which we're checking the implication */
    node: string;
    // allowMismatched is removed - implication handles this naturally
}
```

Or keep it for backward compatibility but ignore it in the new implementation.

### Step 4: Create Tests

Create tests in `tests/rt/pos/ifc/` demonstrating:
1. WildcardQFalse creation and string representation
2. `labelImplies` with wildcards
3. `actsFor` with node option using coalescing
4. Edge cases: mixed quarantine sources (should fail), no quarantine

## File Changes Summary

| File                                  | Changes                                                                 |
|---------------------------------------|-------------------------------------------------------------------------|
| `rt/src/levels/DCLabels/label.mts`    | Add LabelKind.WILDCARD_QFALSE, WildcardQFalseLabel class (non-serializable), update labelImplies |
| `rt/src/levels/DCLabels/dclabel.mts`  | Add createWildcardQuarantineAuthority, modify actsFor to use coalescing |
| `rt/src/serialize.mts`                | No changes needed - already separates JSON output from level accumulation |
| `tests/rt/pos/ifc/...`                | New tests for wildcard functionality                                    |

## Verification Checklist

After implementation, verify:

1. [ ] `labelImplies(WildcardQFalse@nodeA, QuarantinedLabel@nodeA:tag1)` returns true
2. [ ] `labelImplies(WildcardQFalse@nodeA, QuarantinedLabel@nodeB:tag1)` returns false
3. [ ] `labelImplies(WildcardQFalse@nodeA, QFalseLabel@nodeA:tag1)` returns true
4. [ ] `labelImplies(WildcardQFalse@nodeA, RegularLabel)` returns false
5. [ ] `actsFor(label1, label2, {node: "A"})` uses coalescing, not restoration
6. [ ] Serialization still correctly restores quarantined labels for JSON output
7. [ ] Attempting to serialize WildcardQFalseLabel throws an error
8. [ ] Send/spawn to node with quarantined data from same node succeeds
9. [ ] Send/spawn to node with quarantined data from different node fails

## Degree of Autonomy Estimate

- **Step 1 (label.mts)**: Low - straightforward additions following existing patterns
- **Step 2 (dclabel.mts)**: Low - modify actsFor to use coalescing
- **Step 3 (QuarantineOptions)**: Low - minor type change
- **Step 4 (tests)**: Low - following existing test patterns

---

*Last updated: 2026-01-20*
