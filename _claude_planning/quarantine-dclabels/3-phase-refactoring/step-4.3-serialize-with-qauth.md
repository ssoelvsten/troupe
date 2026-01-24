# Step 4.3: Add serializeWithQuarantineAuth

**Status**: NOT STARTED

**Depends on**: Step 4.2

---

## Objective

Add a function to serialize labeled values with quarantine authority support, enabling reverse quarantine when sending to remote nodes.

## File to Modify

`rt/src/serialize.mts`

## Context

When sending quarantined data back to its source node, we can "reverse" the quarantine by providing the quarantine authority that was obtained when the data was originally quarantined.

The quarantine authority "acts for" the quarantined labels, allowing them to be restored.

## Implementation

Add new function:

```typescript
import { actsFor } from './levels/tagsets.mjs';

/**
 * Serialize a labeled value with quarantine authority support.
 *
 * If quarantineAuth is provided and acts-for quarantined labels in the value,
 * those labels will be restored (reverse quarantine) before serialization.
 *
 * @param w The labeled value to serialize
 * @param pclev The PC level
 * @param targetNodeId The target node ID for serialization
 * @param quarantineAuth Optional quarantine authority for reverse quarantine
 */
export function serializeWithQuarantineAuth(
    w: LVal,
    pclev: Level,
    targetNodeId: string,
    quarantineAuth: Level | null
): { data: any; level: Level } {

    function serializeLevelWithAuth(lev: Level, contextLval: LVal): any {
        // If level has quarantined labels and we have authority...
        if (lev.hasQuarantinedLabels && lev.hasQuarantinedLabels()) {
            // Check if we can restore with provided authority
            if (quarantineAuth !== null) {
                // Try restoration with authority coalescing
                const coalescedAuth = lev.coalesce ? lev.coalesce(quarantineAuth) : lev;
                const result = lev.restoreForNode(targetNodeId);

                if (result.success === true) {
                    return result.label.toJSON();
                }
                // If restoration fails, check if authority covers the mismatch
                // This is the key: quarantine authority allows restoration
                if (canAuthorizeRestoration(lev, quarantineAuth, targetNodeId)) {
                    const forcedResult = forceRestoreWithAuth(lev, targetNodeId);
                    if (forcedResult) {
                        return forcedResult.toJSON();
                    }
                }
            }

            // No authority or authority insufficient - use normal path
            // This will throw if quarantine source doesn't match target
            const result = lev.restoreForNode(targetNodeId);
            if (result.success === true) {
                return result.label.toJSON();
            }
            throw new QuarantineForwardError(
                contextLval,
                targetNodeId,
                result.mismatchedNodes
            );
        }

        return lev.toJSON();
    }

    // Use the existing serialize logic but with our custom level handler
    return serializeWithLevelHandler(w, pclev, targetNodeId, serializeLevelWithAuth);
}

/**
 * Check if quarantine authority can authorize restoration to target node.
 */
function canAuthorizeRestoration(
    lev: Level,
    auth: Level,
    targetNodeId: string
): boolean {
    // Authority acts-for the quarantined label with target node context
    return actsFor(auth, lev, { node: targetNodeId });
}

/**
 * Force restore quarantined labels using authority.
 * This is used when authority covers labels from a different source node.
 */
function forceRestoreWithAuth(lev: Level, targetNodeId: string): Level | null {
    // Implementation depends on DCLabel internals
    // May need to add a method to DCLabel for this
    const dcLev = lev as DCLabel;

    // Restore all quarantined labels regardless of source node
    // Authority has already been checked
    return dcLev.forceRestore ? dcLev.forceRestore() : null;
}
```

## Additional DCLabel Method (if needed)

May need to add `forceRestore()` to DCLabel that restores all quarantined labels without checking node match:

```typescript
// In dclabel.mts
forceRestore(): DCLabel {
    return new DCLabel(
        this.forceRestoreCNF(this.confidentiality),
        this.forceRestoreCNF(this.integrity)
    );
}

private forceRestoreCNF(cnf: CNF): CNF {
    // Restore QuarantinedLabel -> RegularLabel
    // Restore QFalseLabel -> CNF_FALSE
    // ... implementation
}
```

## Verification

```bash
make rt
```

## Completion Checklist

- [ ] serializeWithQuarantineAuth function added
- [ ] canAuthorizeRestoration helper added
- [ ] forceRestoreWithAuth helper added (or DCLabel.forceRestore)
- [ ] `make rt` succeeds
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

This is the most complex step. The exact implementation may need adjustment based on how quarantine authority interacts with label restoration.

(Add any implementation notes here after completion)
