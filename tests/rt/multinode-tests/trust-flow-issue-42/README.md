# Trust Flow Issue #42 Reproduction Test

This test reproduces the issue described in GitHub issue #42 where an illegal trust flow during remote spawn results in a JavaScript runtime error showing "Unhandled general error" instead of being handled as a proper Troupe runtime error.

## Issue
When trying to spawn a process on a remote node with information at a higher security level than the trust level of that node, the runtime throws a `StrThreadError` with "Illegal trust flow when spawning on a remote node". However, this error is incorrectly handled by the network error processing system rather than the Troupe runtime error system.

## Test Setup
- **node1**: Spawner node with trust map that only trusts node2 at level `{}`
- **node2**: Target node that would receive the spawn request
- **Trust configuration**: node1 trusts node2 only at empty level `{}`
- **Spawn attempt**: Tries to spawn with information at level `{secret}`

## Expected Behavior (Bug)
- Should show "Unhandled general error" message
- Should show the network error processing handling the StrThreadError

## Desired Behavior (After Fix)
- Should show proper Troupe runtime error message
- Should not show "Unhandled general error"