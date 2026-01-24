# Step 4.2: Add sendMessageWithQuarantineAuth

**Status**: NOT STARTED

**Depends on**: Step 4.1

---

## Objective

Add a new runtime method `sendMessageWithQuarantineAuth` that handles sending messages with optional quarantine authority for reverse quarantine.

## File to Modify

`rt/src/runtimeMonitored.mts`

## Implementation

Add new function:

```typescript
/**
 * Send a message with optional quarantine authority.
 *
 * If quarantineAuth is provided, it can be used to restore quarantined
 * labels when sending to a remote node (reverse quarantine).
 *
 * @param lRecipientPid Labeled recipient process ID
 * @param message The message to send
 * @param quarantineAuth Optional quarantine authority for reverse quarantine
 * @param ret Whether to return unit value (default true)
 */
function rt_sendMessageWithQuarantineAuth(
    lRecipientPid: LVal,
    message: LVal,
    quarantineAuth: Level | null,
    ret = true
) {
    let recipientPid = lRecipientPid.val;

    if (isLocalPid(recipientPid)) {
        // Local send - pass quarantine auth to mailbox for metadata
        __theMailbox.addMessage(
            __nodeManager.getNodeId(),
            lRecipientPid,
            message,
            $t().pc,
            quarantineAuth
        );
        if (ret) {
            return $t().returnImmediateLValue(__unit);
        }
    } else {
        // Remote send - use quarantine auth for label restoration
        return sendMessageToRemoteWithQuarantineAuth(
            recipientPid,
            message,
            quarantineAuth
        );
    }
}

/**
 * Send message to remote node with quarantine authority.
 */
function sendMessageToRemoteWithQuarantineAuth(
    toPid: any,
    message: LVal,
    quarantineAuth: Level | null
) {
    let node = toPid.node.nodeId;
    let pid = toPid.pid;

    // Serialize with quarantine authority for reverse quarantine
    let { data, level } = serializeWithQuarantineAuth(
        new MbVal(message, $t().pc),
        $t().pc,
        node,
        quarantineAuth
    );

    let trustLevel = nodeTrustLevel(node);

    if (!actsFor(trustLevel, level, { node })) {
        threadError(
            "Illegal trust flow when sending information to a remote node",
            false,
            null,
            ErrorKind.IFCCheck
        );
    } else {
        p2p.sendp2p(node, pid, data);
        return $t().returnImmediateLValue(__unit);
    }
}
```

Also add import for `serializeWithQuarantineAuth` from serialize.mts (to be added in Step 4.3).

## Wire to RuntimeInterface

In `rt/src/RuntimeInterface.mts`, add to interface:

```typescript
sendMessageWithQuarantineAuth(
    lRecipientPid: LVal,
    message: LVal,
    quarantineAuth: Level | null
): any;
```

And in the implementation object, add:
```typescript
sendMessageWithQuarantineAuth: rt_sendMessageWithQuarantineAuth,
```

## Verification

After Step 4.3:
```bash
make rt
```

## Completion Checklist

- [ ] rt_sendMessageWithQuarantineAuth function added
- [ ] sendMessageToRemoteWithQuarantineAuth function added
- [ ] RuntimeInterface updated
- [ ] `make rt` succeeds (after Step 4.3)
- [ ] Mark this step COMPLETED in INDEX.md

## Notes

(Add any implementation notes here after completion)
