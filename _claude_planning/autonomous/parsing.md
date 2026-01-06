# Parser Error Message Improvements - Implementation Plan

## Overview

This document describes the comprehensive plan to improve parser error messages in the Troupe compiler. The goal is to transform cryptic error messages like:

```
Parse Error:
/path/file.trp:5:5 unexpected token TokenVal
```

Into helpful, context-rich messages like:

```
/path/file.trp:5:5: parse error
  (while parsing let expression)

  5 | in  val _ = save (authority, "f_ext", f_ext)
    |     ^

  unexpected keyword 'val'
  expected one of: identifier, 'fun', expression

Suggestion: 'val' can only appear in let declarations.
  Perhaps you meant to use 'let val x = ...' or forgot 'end'?
```

## Current Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Token pretty-printing (`showToken`) | **Completed** |
| Phase 2 | Source context display (ParseError.hs) | **Completed** |
| Phase 3 | Expected tokens (`%errorhandlertype explist`) | **Completed** |
| Phase 4 | Context tracking | **Completed** |
| Phase 5 | Suggestions for common mistakes | Pending |
| Phase 6 | DC label specialized messages | Pending |
| Phase 7 | Error recovery | Pending |

## Files Modified So Far

- [Lexer.x](compiler/src/Lexer.x) - Added `showToken` function (84 lines)
- [Parser.y](compiler/src/Parser.y) - Updated monad, parseError, added `%errorhandlertype explist`
- [ParseError.hs](compiler/src/ParseError.hs) - **NEW** - Error formatting module

---

## Phase 4: Context Tracking

### Goal
Add "while parsing X" context to error messages to help users understand where they are in the parse.

### Approach: Inference from Expected Tokens

Rather than maintaining a full context stack (which would require significant grammar changes), we can infer context from the expected tokens. This is simpler and doesn't require changing the parser monad.

### Implementation

**1. Add `inferContext` function to ParseError.hs:**

```haskell
-- | Infer parsing context from expected tokens
inferContext :: [String] -> Maybe Token -> Maybe String
inferContext expected maybeToken = firstJust
  [ checkLetContext
  , checkFunctionContext
  , checkCaseContext
  , checkDCLabelContext
  , checkRecordContext
  , checkListContext
  , checkPatternContext
  ]
  where
    firstJust = foldr (<|>) Nothing

    -- In let declarations (expecting val/fun/end)
    checkLetContext
      | any (`elem` expected) ["keyword 'val'", "keyword 'fun'", "keyword 'end'"]
      , "keyword 'in'" `notElem` expected = Just "let declarations"
      | "keyword 'end'" `elem` expected
      , "keyword 'in'" `elem` expected = Just "let expression"
      | otherwise = Nothing

    -- In function definition (expecting =>)
    checkFunctionContext
      | "'=>'" `elem` expected = Just "function or pattern match"
      | otherwise = Nothing

    -- In case expression (expecting | or =>)
    checkCaseContext
      | "'|'" `elem` expected, "'=>'" `elem` expected = Just "case expression"
      | otherwise = Nothing

    -- In DC label (expecting >` or ;)
    checkDCLabelContext
      | "'>`' (DC label end)" `elem` expected = Just "DC label"
      | "';'" `elem` expected
      , "'>`' (DC label end)" `elem` expected = Just "DC label"
      | otherwise = Nothing

    -- In record (expecting } or ,)
    checkRecordContext
      | "'}'" `elem` expected, "','" `elem` expected
      , "'='" `elem` expected = Just "record"
      | otherwise = Nothing

    -- In list (expecting ] or ,)
    checkListContext
      | "']'" `elem` expected, "','" `elem` expected
      , "'::'" `notElem` expected = Just "list"
      | otherwise = Nothing

    -- In pattern (expecting = after pattern)
    checkPatternContext
      | "'='" `elem` expected
      , "keyword 'val'" `notElem` expected
      , "keyword 'fun'" `notElem` expected = Just "pattern"
      | otherwise = Nothing
```

**2. Update `formatParseError` to use context:**

```haskell
formatParseError :: ParseErrorInfo -> String
formatParseError info@ParseErrorInfo{..} = unlines $ filter (not . null)
  [ locationLine
  , contextLine
  , ""
  , sourceLine
  , caretLine
  , ""
  , unexpectedLine
  , expectedLine
  ]
  where
    -- ... existing code ...

    -- Auto-infer context if not explicitly provided
    contextLine = case peiContext <|> inferContext peiExpected peiToken of
      Just ctx -> "  (while parsing " ++ ctx ++ ")"
      Nothing  -> ""
```

### Testing

After implementation, test with various error scenarios:

```bash
# Let declarations context
echo 'let val x = 1 in x' | bin/troupec /dev/stdin  # missing 'end'

# Function context
echo 'fn x x' | bin/troupec /dev/stdin  # missing '=>'

# DC label context
echo '`< alice bob >`' | bin/troupec /dev/stdin  # missing ';'
```

---

## Phase 5: Suggestions for Common Mistakes

### Goal
Provide helpful suggestions for frequently encountered errors.

### Implementation

**1. Add `suggestFix` function to ParseError.hs:**

```haskell
-- | Suggest fixes for common mistakes
suggestFix :: ParseErrorInfo -> Maybe String
suggestFix ParseErrorInfo{..} = firstJust
  [ checkValOutsideLet
  , checkMissingEnd
  , checkMissingIn
  , checkMissingArrow
  , checkMissingSemicolon
  , checkMismatchedParens
  , checkDCLabelSyntax
  ]
  where
    firstJust = foldr (<|>) Nothing

    -- 'val' appearing outside let declarations
    checkValOutsideLet
      | Just tok <- peiToken
      , isTokenVal tok
      , "keyword 'end'" `notElem` peiExpected
      , any (`elem` peiExpected) ["identifier", "number", "'('"] =
          Just $ "'val' can only appear in let declarations.\n" ++
                 "  Perhaps you meant 'let val x = ... in ... end'?"
      | otherwise = Nothing

    -- Missing 'end' keyword
    checkMissingEnd
      | "keyword 'end'" `elem` peiExpected
      , length peiExpected <= 5 =
          Just "Missing 'end' keyword?\n  Let and case expressions require 'end' to close them."
      | otherwise = Nothing

    -- Missing 'in' keyword
    checkMissingIn
      | "keyword 'in'" `elem` peiExpected =
          Just "Missing 'in' keyword?\n  Syntax: let <declarations> in <expression> end"
      | otherwise = Nothing

    -- Missing '=>' in pattern match
    checkMissingArrow
      | "'=>'" `elem` peiExpected
      , length peiExpected <= 3 =
          Just "Missing '=>' after pattern?\n  Syntax: fn pattern => expression"
      | otherwise = Nothing

    -- Missing semicolon between expressions
    checkMissingSemicolon
      | Just tok <- peiToken
      , isIdentifier tok
      , any (`elem` peiExpected) ["';'", "keyword 'end'", "keyword 'in'"]
      , length peiExpected <= 10 =
          Just "Missing semicolon?\n  Use ';' to separate sequential expressions."
      | otherwise = Nothing

    -- Mismatched parentheses/brackets
    checkMismatchedParens
      | "')'" `elem` peiExpected, length peiExpected == 1 =
          Just "Mismatched parentheses - missing ')'?"
      | "']'" `elem` peiExpected, length peiExpected == 1 =
          Just "Mismatched brackets - missing ']'?"
      | "'}'" `elem` peiExpected, length peiExpected == 1 =
          Just "Mismatched braces - missing '}'?"
      | otherwise = Nothing

    -- DC label syntax help
    checkDCLabelSyntax
      | "'>`' (DC label end)" `elem` peiExpected =
          Just "DC label syntax: `< confidentiality ; integrity >`\n  Example: `< alice ; bob >`"
      | otherwise = Nothing

-- Helper predicates
isTokenVal :: Token -> Bool
isTokenVal TokenVal = True
isTokenVal _ = False

isIdentifier :: Token -> Bool
isIdentifier (TokenSym _) = True
isIdentifier _ = False
```

**2. Update `formatParseError` to include suggestions:**

```haskell
formatParseError :: ParseErrorInfo -> String
formatParseError info@ParseErrorInfo{..} = unlines $ filter (not . null)
  [ locationLine
  , contextLine
  , ""
  , sourceLine
  , caretLine
  , ""
  , unexpectedLine
  , expectedLine
  , ""
  , suggestionLine
  ]
  where
    -- ... existing code ...

    suggestionLine = case suggestFix info of
      Just suggestion -> "Suggestion: " ++ suggestion
      Nothing -> ""
```

### Common Mistake Patterns to Handle

| Error Pattern | Suggestion |
|--------------|------------|
| `val` outside `let` | Explain `let val x = ... in ... end` syntax |
| Missing `end` | Remind about closing let/case expressions |
| Missing `in` | Show let expression syntax |
| Missing `=>` | Show fn/case pattern syntax |
| Missing `;` | Explain sequential expression separator |
| Missing `)`, `]`, `}` | Point out mismatched delimiters |
| DC label incomplete | Show DC label syntax |

---

## Phase 6: DC Label Specialized Messages

### Goal
Provide domain-specific help for DC label syntax errors, which are common for Troupe users dealing with information flow control.

### Implementation

**1. Add DC label detection and suggestions:**

```haskell
-- | Check if error is related to DC labels
isDCLabelError :: ParseErrorInfo -> Bool
isDCLabelError ParseErrorInfo{..} =
    "'`<' (DC label)" `elem` peiExpected ||
    "'>`' (DC label end)" `elem` peiExpected ||
    case peiToken of
      Just TokenDCLabelLeft -> True
      Just TokenDCLabelRight -> True
      Just TokenDCRootConf -> True
      Just TokenDCRootInteg -> True
      Just TokenDCNullConf -> True
      Just TokenDCNullInteg -> True
      _ -> False

-- | Specialized DC label error messages
dcLabelSuggestion :: ParseErrorInfo -> Maybe String
dcLabelSuggestion info@ParseErrorInfo{..}
  | not (isDCLabelError info) = Nothing

  -- Missing semicolon separator
  | Just (TokenSym _) <- peiToken
  , "'>`' (DC label end)" `elem` peiExpected
  , "';'" `elem` peiExpected =
      Just $ unlines
        [ "DC labels require a semicolon to separate confidentiality and integrity."
        , "  Syntax: `< confidentiality ; integrity >`"
        , "  Example: `< alice ; bob >`"
        , ""
        , "  Special values:"
        , "    #root-confidentiality, #root-integrity (most restrictive)"
        , "    #null-confidentiality, #null-integrity (least restrictive)"
        ]

  -- Empty DC label
  | Just TokenDCLabelRight <- peiToken =
      Just $ unlines
        [ "Empty DC label is not allowed."
        , "  Use `< principal ; principal >` or special values:"
        , "    `< #null-confidentiality ; #null-integrity >` for public data"
        , "    `< #root-confidentiality ; #root-integrity >` for secret data"
        ]

  -- Wrong order (integrity before confidentiality)
  | Just TokenDCRootInteg <- peiToken =
      Just $ unlines
        [ "In DC labels, confidentiality comes before integrity."
        , "  Syntax: `< confidentiality ; integrity >`"
        , "  You may have them in the wrong order."
        ]

  -- Unclosed DC label
  | "'>`' (DC label end)" `elem` peiExpected
  , length peiExpected <= 3 =
      Just "Unclosed DC label - missing '>`'?"

  | otherwise = Nothing
```

**2. Integrate into formatParseError:**

Check DC label suggestions before general suggestions for more specific messages:

```haskell
suggestionLine = case dcLabelSuggestion info <|> suggestFix info of
  Just suggestion -> "Suggestion: " ++ suggestion
  Nothing -> ""
```

### DC Label Test Cases

Create test files in `tests/cmp/`:

```
# dc-label-missing-semicolon.trp
let x = `< alice bob >` in x end

# dc-label-empty.trp
let x = `< >` in x end

# dc-label-wrong-order.trp
let x = `< #root-integrity ; #root-confidentiality >` in x end

# dc-label-unclosed.trp
let x = `< alice ; bob in x end
```

---

## Phase 7: Error Recovery

### Goal
Report multiple errors per file instead of stopping at the first error. This helps users fix all issues in one compilation attempt.

### Approach

Happy supports error recovery through the special `error` token in grammar rules. When the parser encounters an error, it can:
1. Record the error
2. Skip tokens until it reaches a synchronization point
3. Continue parsing

### Implementation Strategy

**1. Define synchronization points:**

Good synchronization points for Troupe are:
- After `end` keyword (closes let/case)
- After `;` (expression separator)
- After top-level structure boundaries

**2. Extend parser state to accumulate errors:**

```haskell
-- Change monad to include error accumulation
data ParseState = ParseState
  { psErrors :: [ParseErrorInfo]
  , psSource :: String
  , psFilename :: String
  }

type ParseM a = StateT ParseState (Except String) a

-- Or simpler: use IORef in the monad
```

**3. Add error productions to grammar:**

```haskell
-- In Decs (declarations)
Decs : Dec                      { [$1] }
     | Dec Decs                 { $1 : $2 }

Dec : val Pattern '=' Expr      { ValDecl $2 $4 }
    | FunDecs                   { FunDecs $1 }
    -- Error recovery: skip to next declaration
    | error                     {% recordError >> return ErrorDecl }

-- In Expr (expressions)
Expr : -- ... normal productions ...
     -- Error recovery: skip to semicolon or end
     | error ';' Expr           {% recordError >> return (Loc NoPos (Error "parse error")) }
     | error end                {% recordError >> return (Loc NoPos (Error "parse error")) }
```

**4. Report all errors at end:**

```haskell
parseProg :: FilePath -> String -> Either String Prog
parseProg filename input = do
  let initialState = ParseState [] input filename
  case runStateT (runExcept parseWithRecovery) initialState of
    Left err -> Left err
    Right (prog, state) ->
      case psErrors state of
        [] -> Right prog
        errs -> Left $ unlines $ map formatParseError errs
```

### Caution: Cascading Errors

Error recovery can produce cascading errors where one real error causes multiple reported errors. Mitigations:

1. **Limit error count**: Stop after 10 errors with "too many errors, stopping"
2. **Track positions**: Don't report multiple errors at the same position
3. **Error suppression**: After an error, suppress errors on the same line
4. **Recovery quality**: Choose good synchronization points to minimize cascading

### Alternative: Simpler Two-Pass Approach

If full error recovery is too complex, consider a simpler approach:

1. First pass: Parse normally, report first error
2. If error found, do a "lint" pass that just checks for obvious issues:
   - Unmatched delimiters (parentheses, brackets, braces)
   - Unclosed let/case expressions (missing `end`)
   - Obvious syntax issues

This gives users more information without the complexity of grammar-level error recovery.

### Implementation Order

1. Start with the two-pass approach (lower risk)
2. If that works well, consider full grammar-level recovery
3. Add `--no-recovery` flag for debugging cascading error issues

---

## Testing Strategy

### Golden Test Updates

After implementing each phase, run the golden tests:

```bash
# Run all compiler tests
bin/golden -p cmp

# Check specific patterns
bin/golden -p dc-label
bin/golden -p parseerror
```

Many golden files will need updates. Review each change carefully to ensure the new format is correct.

### New Test Cases

Create test files to exercise the new error messages:

```
tests/cmp/parseerror-val-in-expr.trp
tests/cmp/parseerror-missing-in.trp
tests/cmp/parseerror-missing-end.trp
tests/cmp/parseerror-missing-arrow.trp
tests/cmp/parseerror-missing-semicolon.trp
tests/cmp/parseerror-mismatched-parens.trp
```

Each should have a corresponding `.golden` file after running the test suite.

### Manual Testing

Test with real-world error scenarios:

```bash
# Test the original motivating example
bin/troupec tests/_unautomated/simple-4-save.trp

# Test various error types
echo 'let x = 1 in x' | bin/troupec /dev/stdin          # missing end
echo 'fn x x' | bin/troupec /dev/stdin                   # missing =>
```

> **⚠️ Important: DC Label Testing**
>
> DC labels use backtick syntax (`` `< ... >` ``), which causes shell interpretation issues.
> **Do NOT test DC labels with `echo` or inline shell commands.** Instead, create a `.trp`
> test file and compile it directly:
>
> ```bash
> # WRONG - backticks will be interpreted by the shell:
> # echo '`< alice bob >`' | bin/troupec /dev/stdin
>
> # CORRECT - use a test file:
> cat > /tmp/test_dc.trp << 'EOF'
> `< alice bob >`
> EOF
> bin/troupec /tmp/test_dc.trp
> ```
>
> For permanent tests, create files in `tests/cmp/` directory.

---

## Appendix: Files Reference

### Modified Files

| File | Description |
|------|-------------|
| `compiler/src/Lexer.x` | Token definitions, `showToken` function |
| `compiler/src/Parser.y` | Parser grammar, error handling |
| `compiler/src/ParseError.hs` | Error formatting module (new) |
| `compiler/package.yaml` | Module registration (auto-discovered) |

### Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `showToken` | Lexer.x | Human-readable token names |
| `parseError` | Parser.y | Error handler called by Happy |
| `cleanExpectedToken` | Parser.y | Clean Happy token names |
| `formatParseError` | ParseError.hs | Format complete error message |
| `inferContext` | ParseError.hs | Infer parse context (Phase 4) |
| `suggestFix` | ParseError.hs | Common mistake suggestions (Phase 5) |
| `dcLabelSuggestion` | ParseError.hs | DC label help (Phase 6) |

### Data Types

```haskell
-- Parse environment (threaded through parser)
data ParseEnv = ParseEnv
  { peFilename :: String
  , peSource   :: String
  }

-- Complete error information
data ParseErrorInfo = ParseErrorInfo
  { peiFilename    :: String
  , peiLine        :: Int
  , peiColumn      :: Int
  , peiToken       :: Maybe Token
  , peiExpected    :: [String]
  , peiSourceLines :: [String]
  , peiContext     :: Maybe String
  }
```
