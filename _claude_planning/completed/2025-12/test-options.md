# Per-Test Options for Golden Framework

## Problem Statement

In our testing framework, we currently do not have any way of
controlling with which options different Troupe tests are being executed, which means
that all tests are executed with default options. This has been okay so far, but
as the system evolves, we will need to test different options.

The very first such option is CLI arguments. Because CLI arguments are passed
externally, none of our tests right now actually check that the CLI arguments
are correctly received.

We envision other options in the future, so let's address this problem by
extending the golden framework with an `.options` file.

## Design

### File Format

For each test file `test.trp`, there may be an optional `test.trp.options` file that
contains extra arguments to pass to `./local.sh`.

The format uses standard shell-style argument syntax, parsed using the `shellwords`
Haskell package for proper POSIX-compliant shell word splitting. Lines starting
with `#` are treated as comments.

Example `test.trp.options`:
```
# Pass CLI arguments to the program
-- hello world "quoted arg"
```

This will result in calling:
```
./local.sh [framework-args] test.trp -- hello world "quoted arg"
```

Example for runtime options:
```
--no-v1-labels
```

### Naming Convention

Following the existing pattern with `.input` files:
- Test file: `mytest.trp`
- Input file: `mytest.trp.input`
- Options file: `mytest.trp.options`

### Implementation

The implementation uses the `shellwords` package for robust shell argument parsing:

```haskell
import qualified ShellWords

getOptionalOptions :: String -> IO [String]
getOptionalOptions testfile = do
    let optionsFile = testfile ++ ".options"
    optionsExists <- doesFileExist optionsFile
    if optionsExists then do
        content <- readFile optionsFile
        let filtered = unlines $ filter notComment $ lines content
        case ShellWords.parse filtered of
            Right args -> return args
            Left _     -> return []
    else
        return []
  where notComment ('#':_) = False
        notComment _       = True
```

A helper `mkLocalArgs` consolidates argument building for both `runLocal` and `runTimeout`:

```haskell
mkLocalArgs :: String -> TestConfig -> IO [String]
mkLocalArgs testname tc = do
    extraArgs <- getOptionalOptions testname
    return $ mkRunArgs tc ++ [testname] ++ extraArgs
```

## Status

- [x] Design complete
- [x] Implementation (2025-12-28)
- [x] Testing verified
- [x] Added `shellwords` dependency to `compiler/package.yaml`

## Tests Added

1. **`tests/rt/pos/ifc/cliargs-with-args.trp`** - Tests CLI arguments passed via `.options`
   - Options file: `-- hello world`
   - Verifies `getCliArgs authority` receives the arguments

2. **`tests/rt/pos/ifc/labels-v2-format.trp`** - Tests `--no-v1-labels` runtime option
   - Options file: `--no-v1-labels`
   - Verifies labels print with V2 format (`<>` instead of `{}`)
