# Trust Flow Issue #42 Regression Test

This test validates that trust flow violations during remote spawn are handled 
properly by the Troupe runtime error system, rather than being treated as 
"Unhandled general error" by the network error handler.

## Test Scenario
- Node1 attempts to spawn on Node2 with `{secret}` level information
- Node2 has default trust level `{}` (no explicit trustmap)
- This should trigger "Illegal trust flow" error with proper Troupe error handling

## Expected Behavior (After Fix)
- Node1 should show proper Troupe runtime error message
- Should NOT show "Unhandled general error case" messages  
- Should show clean trust flow violation message
- No JavaScript stack traces should appear

## Test Validation
This test ensures the fix prevents trust flow errors from being misrouted 
through network error processing.