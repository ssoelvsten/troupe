# Task: Add CLI Arguments Access

## Source
GitHub Issue #122: https://github.com/TroupeLang/Troupe/issues/122
Labels: `runtime`

> "Add support for accessing CLI arguments"

This enables Troupe programs to access command-line arguments passed when executing them.

## Objective

Add a built-in function `getCliArgs` that returns the command-line arguments as a Troupe list of strings.

---

## Design

### Security Model

CLI arguments should be treated as a **sensitive resource** requiring root authority to access. This design follows Troupe's IFC principles:

1. **Authority Requirement**: `getCliArgs` requires an authority argument (similar to `getStdout`)
2. **Root Authority Check**: Only root authority can access CLI arguments
3. **High Sensitivity Labeling**: Returned arguments are labeled at `ROOT` level

**Rationale:**
- CLI arguments may contain secrets (API keys, tokens, passwords, credentials)
- They represent an external input channel similar to stdin (which defaults to ROOT level)
- Restricting access to root authority ensures only the main process (or explicitly delegated code) can access them
- The high label prevents unintentional leakage through information flow

This follows the pattern established by `getStdout` in `stdio.mts` and `exit` in `exit.mts`.

### Function Signature

The function should:
1. Accept an authority value as argument
2. Validate the authority is root authority
3. Return a list of strings representing CLI arguments, labeled at ROOT level
4. Arguments should be those after `--` in the command line (to separate runtime args from program args)

**Example usage:**
```troupe
(* Authority is available in the main process context *)
let args = getCliArgs authority
in print args
end
```

**Invocation:**
```bash
./local.sh myprogram.trp -- arg1 arg2 arg3
# args would be ["arg1", "arg2", "arg3"]
```

---

## Files to Modify

### 1. `/compiler/src/IR.hs`

**Add to the built-in function list (around line 292):**
```haskell
, "getTime"
, "getCliArgs"   -- ADD THIS LINE
, "getNanoTime"
```

---

### 2. `/rt/src/builtins/cliargs.mts` (NEW FILE)

```typescript
'use strict'
import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { LVal } from '../Lval.mjs';
import { assertIsAuthority, assertIsRootAuthority, assertNormalState } from '../Asserts.mjs'
import { mkList } from '../ValuesUtil.mjs'
import * as levels from '../Level.mjs'

export function BuiltinCliArgs<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        getCliArgs = mkBase((arg) => {
            assertNormalState("getCliArgs")

            // Require authority argument and validate it's root authority
            assertIsAuthority(arg)
            assertIsRootAuthority(arg)

            // Get program arguments (those after --)
            const args = process.argv;
            const separatorIndex = args.indexOf('--');

            let programArgs: string[];
            if (separatorIndex !== -1) {
                // Arguments after --
                programArgs = args.slice(separatorIndex + 1);
            } else {
                // No separator, return empty list
                // Conservative: require explicit -- to pass arguments
                programArgs = [];
            }

            // Convert to Troupe list of LVals
            // Label each argument at ROOT level (sensitive data)
            const lvalArgs = programArgs.map(s => new LVal(s, levels.ROOT));
            const result = mkList(lvalArgs);

            // Return the list labeled at ROOT level
            return this.runtime.ret(new LVal(result, levels.ROOT));
        }, "getCliArgs")
    }
}
```

**Key security aspects in the implementation:**
- `assertIsAuthority(arg)` ensures the argument is an authority value
- `assertIsRootAuthority(arg)` ensures it's specifically root authority
- Each string argument is labeled at `levels.ROOT` (high sensitivity)
- The result list itself is also labeled at `levels.ROOT`

---

### 3. `/rt/src/UserRuntime.mts`

**Add import (after line 16):**
```typescript
import { BuiltinGetTime } from './builtins/getTime.mjs'
import { BuiltinCliArgs } from './builtins/cliargs.mjs'  // ADD THIS
import { BuiltinStringToInt } from './builtins/stringToInt.mjs'
```

**Add to composition chain (after BuiltinGetTime, around line 51):**
```typescript
BuiltinGetTime(
BuiltinCliArgs(   // ADD THIS
BuiltinAdv(
...
```

**Note:** The exact position in the chain doesn't matter for functionality, but grouping similar utilities together helps readability.

---

## Alternative Design: Without `--` Separator

If you want to expose ALL arguments (including runtime flags), the implementation could be:

```typescript
getCliArgs = mkBase((arg) => {
    assertNormalState("getCliArgs")
    assertIsAuthority(arg)
    assertIsRootAuthority(arg)

    // Skip: node, troupe.mjs, and the .trp file path
    // This leaves user-provided arguments
    const args = process.argv.slice(3);

    const lvalArgs = args.map(s => new LVal(s, levels.ROOT));
    const result = mkList(lvalArgs);

    return this.runtime.ret(new LVal(result, levels.ROOT));
}, "getCliArgs")
```

This approach is simpler but may expose runtime flags to the Troupe program. The security model (authority requirement, ROOT labeling) remains the same.

---

## Verification Steps

1. Build the compiler:
   ```bash
   make stack
   ```

2. Build the runtime:
   ```bash
   make rt
   ```

3. Create test file:
   ```bash
   cat > tests/_unautomated/claude/cli_args_test.trp << 'EOF'
   (* authority is available in the main process context *)
   let args = getCliArgs authority
   in print args
   end
   EOF
   ```

4. Test with arguments:
   ```bash
   ./local.sh tests/_unautomated/claude/cli_args_test.trp -- hello world 123
   # Expected output: ["hello", "world", "123"]@<top ; top>
   # Note: the @<top ; top> label indicates ROOT-level data
   ```

5. Test without arguments:
   ```bash
   ./local.sh tests/_unautomated/claude/cli_args_test.trp
   # Expected output: []@<top ; top>
   ```

6. Test without authority (should fail):
   ```bash
   cat > tests/_unautomated/claude/cli_args_no_auth_test.trp << 'EOF'
   (* This should fail - no authority provided *)
   let args = getCliArgs ()
   in print args
   end
   EOF
   ./local.sh tests/_unautomated/claude/cli_args_no_auth_test.trp
   # Expected: Runtime error - value () is not a authority
   ```

7. Test with insufficient authority (should fail):
   ```bash
   cat > tests/_unautomated/claude/cli_args_low_auth_test.trp << 'EOF'
   (* Attenuate authority to a lower level *)
   let lowAuth = attenuate (authority, `<bob ; bob>`)
       args = getCliArgs lowAuth
   in print args
   end
   EOF
   ./local.sh tests/_unautomated/claude/cli_args_low_auth_test.trp -- secret
   # Expected: Runtime error - Provided authority is not ROOT
   ```

8. Run full test suite:
   ```bash
   make test
   ```

---

## Notes

- This unblocks GitHub Issue #101 (`Unit`: support `--no-color`)
- The `--` separator is a common Unix convention for separating program options from arguments
- Consider adding `getCliArgsRaw` later if access to all argv is needed

### Security Design Summary

| Aspect                    | Design Choice                                    |
|---------------------------|--------------------------------------------------|
| Access Control            | Requires root authority                          |
| Data Sensitivity Label    | ROOT level (highest)                             |
| Pattern Followed          | Same as `getStdout`, `exit`, `raiseTrust`        |
| Rationale                 | CLI args may contain secrets; external input     |

**Why root authority?**
- CLI arguments are an external input channel (like stdin)
- They may contain sensitive data (API keys, passwords, tokens)
- Only the main process (which receives `authority`) should access them
- Sandboxed or attenuated code should not be able to read CLI arguments

**Why ROOT labeling?**
- Prevents information leakage through implicit flows
- Code operating at lower security levels cannot observe CLI argument values
- Consistent with stdin handling (`__stdio_lev` defaults to ROOT)
