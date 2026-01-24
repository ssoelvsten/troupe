# Step 4.2: Consolidate sendMessageToRemote with qauth Support

**Status**: NOT STARTED

**Depends on**: Step 4.1

---

## Objective

Modify existing `sendMessageToRemote` and `rt_sendMessageNochecks` to accept optional quarantine authority. **No separate `sendMessageWithQuarantineAuth` function.**

## Key Semantic Change

**Before**: `actsFor(..., { node })` automatically coalesces with node-specific wildcard authority

**After**:
- 2-arg send: No automatic coalescing → fails for quarantined data
- 3-arg send: Uses explicit qauth → enables quarantined data sends

## File to Modify

`rt/src/runtimeMonitored.mts`

## Implementation

### Modify sendMessageToRemote

```typescript
import { Authority } from './Authority.mjs';

/**
 * Send message to remote node.
 *
 * @param toPid The pid of the remote process
 * @param message The data to send
 * @param qauth Optional quarantine authority for sending quarantined data
 */
function sendMessageToRemote(toPid, message, qauth?: Authority) {
    let node = toPid.node.nodeId;
    let pid = toPid.pid;

    let { data, level } = serialize(new MbVal(message, $t().pc), $t().pc, node);

    let trustLevel = nodeTrustLevel(node);

    // Key change: only coalesce if qauth provided
    // REMOVED: { node } option - no more automatic wildcard coalescing
    let effectiveTrust = qauth
        ? trustLevel.coalesce(qauth.authorityLevel)
        : trustLevel;

    if (!actsFor(effectiveTrust, level)) {  // <-- No { node } option!
        threadError(
            "Illegal trust flow when sending information to a remote node\n" +
            ` | the trust level of the recepient node: ${trustLevel.stringRep()}\n` +
            (qauth ? ` | effective trust (with qauth): ${effectiveTrust.stringRep()}\n` : '') +
            ` | the level of the information to send:  ${level.stringRep()}`,
            false, null, ErrorKind.IFCCheck
        );
    } else {
        p2p.sendp2p(node, pid, data);
        return $t().returnImmediateLValue(__unit);
    }
}
```

### Modify rt_sendMessageNochecks

```typescript
function rt_sendMessageNochecks(lRecipientPid, message, qauth?: Authority, ret = true) {
    let recipientPid = lRecipientPid.val;

    if (isLocalPid(recipientPid)) {
        __theMailbox.addMessage(__nodeManager.getNodeId(), lRecipientPid, message, $t().pc);
        if (ret) {
            return $t().returnImmediateLValue(__unit);
        }
    } else {
        debug("* rt rt_send remote *");
        return sendMessageToRemote(recipientPid, message, qauth);
    }
}
```

### Wire to runtime object

Ensure the updated function is accessible via `$r.sendMessageNoChecks`:

```typescript
sendMessageNoChecks = rt_sendMessageNochecks;
```

## Behavioral Changes

| Scenario | Before | After |
|----------|--------|-------|
| 2-arg send, non-quarantined | Works | Works (unchanged) |
| 2-arg send, quarantined back to source | Works (auto wildcard) | **Fails** |
| 3-arg send with qauth | N/A | Works |

## Verification

After completing Step 4.3:
```bash
make rt
```

## Completion Checklist

- [ ] sendMessageToRemote modified to accept optional qauth
- [ ] rt_sendMessageNochecks modified to accept optional qauth
- [ ] Import added for Authority
- [ ] `{ node }` option removed from actsFor call
- [ ] `make rt` succeeds (after Step 4.3)
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

- Uses `Authority` type instead of `Level | null`
- No separate function - consolidated into existing sendMessageToRemote
- Automatic wildcard coalescing removed - explicit qauth required for quarantined data
