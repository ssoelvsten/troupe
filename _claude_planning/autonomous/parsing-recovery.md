# Parser Error Recovery - Phase 7 Implementation Plan

## Overview

Implement full grammar-level error recovery using Happy's `catch` token mechanism to report multiple parse errors per file instead of stopping at the first error. All errors will be combined into a single output message.

## Prerequisites

- **Happy 2.1+** required for `catch` token support
- LTS-24.1 (current resolver) includes Happy 2.1.7 ✓
- No stack.yaml changes needed

---

## Step 1: Extend Parser Monad for Error Accumulation

**File:** `compiler/src/ParseError.hs`

Add new types and functions:

```haskell
-- Error accumulation state
data ParseState = ParseState
  { psErrors       :: [ParseErrorInfo]  -- Accumulated errors (reverse order)
  , psErrorCount   :: Int               -- For limiting
  , psLastErrorPos :: Maybe (Int, Int)  -- For duplicate suppression
  }

initialParseState :: ParseState
initialParseState = ParseState [] 0 Nothing

-- Configuration
maxParseErrors :: Int
maxParseErrors = 10

minErrorDistance :: Int
minErrorDistance = 2  -- lines

-- Multi-error formatting (combined output)
formatAllErrors :: [ParseErrorInfo] -> String
formatAllErrors [] = ""
formatAllErrors [e] = formatParseError e
formatAllErrors errs =
  "Found " ++ show (length errs) ++ " parse errors:\n\n" ++
  intercalate "\n----------------------------------------\n\n" (map formatParseError errs)
```

**File:** `compiler/src/Parser.y`

Change monad from:
```haskell
%monad { ReaderT ParseEnv (Except String) } { (>>=) } { return }
```

To:
```haskell
%monad { ReaderT ParseEnv (StateT ParseState (Except String)) } { (>>=) } { return }
```

Update error directive:
```haskell
%error { parserAbort } { parserReport }
```

---

## Step 2: Implement Error Handler Functions

**File:** `compiler/src/Parser.y`

```haskell
-- Called when recovery is impossible
parserAbort :: ([L Token], [String]) -> ParseM a
parserAbort (tokens, expected) = do
  recordError tokens expected
  state <- get
  throwError $ formatAllErrors (reverse $ psErrors state)

-- Called on each error for potential recovery
parserReport :: ([L Token], [String]) -> ([L Token] -> ParseM a) -> ParseM a
parserReport (tokens, expected) resume = do
  recorded <- recordError tokens expected
  state <- get
  if psErrorCount state >= maxParseErrors
    then parserAbort (tokens, expected)
    else resume tokens

-- Record an error (with deduplication)
recordError :: [L Token] -> [String] -> ParseM Bool
recordError tokens expected = do
  env <- ask
  state <- get
  let (line, col) = getPosition tokens
      isDup = case psLastErrorPos state of
        Nothing -> False
        Just (lastLine, _) -> abs (line - lastLine) < minErrorDistance
  if isDup
    then return False
    else do
      let err = makeParseErrorInfo env tokens expected
      put state { psErrors = err : psErrors state
                , psErrorCount = psErrorCount state + 1
                , psLastErrorPos = Just (line, col) }
      return True
```

---

## Step 3: Add AST Error Nodes

**File:** `compiler/src/Direct.hs`

Add error constructors (note: `Error` already exists in `Term`, add for patterns/decls):

```haskell
data DeclPattern
    = VarPattern VarName
    | ...existing...
    | ErrorPattern PosInf    -- NEW: error recovery in pattern position

data Decl
    = ValDecl LDeclPattern LTerm
    | FunDecs [LFunDecl]
    | ErrorDecl PosInf       -- NEW: error recovery in declaration position
```

Add helper constructors in Parser.y:
```haskell
errorExpr :: L Token -> LTerm
errorExpr (L pos _) = L pos (Lit LUnit)  -- Placeholder

errorPattern :: L Token -> LDeclPattern
errorPattern (L pos _) = L pos Wildcard  -- Placeholder

errorDecl :: L Token -> Decl
errorDecl (L pos _) = ErrorDecl pos
```

---

## Step 4: Add `catch` Productions to Grammar

**File:** `compiler/src/Parser.y`

Add `catch` token and productions at key synchronization points:

```happy
-- Top-level expression recovery
Expr : Form                           { $1 }
     | let Decs in Expr end           {% ... }
     | case Expr of Match end         {% ... }
     | catch                          {% recordError >> return (errorExpr $1) }

-- Declaration recovery (recover at val/fun/in)
Dec : val Pattern '=' Expr            { ValDecl $2 $4 }
    | FunDecs                         { FunDecs $1 }
    | catch                           {% recordError >> return (errorDecl $1) }

Decs : Dec                            { [$1] }
     | Dec Decs                       { $1 : $2 }
     | catch Decs                     {% recordError >> return (errorDecl $1 : $2) }

-- Case arm recovery (recover at | or end)
Match : Pattern '=>' Expr             { [($1, $3)] }
      | Pattern '=>' Expr '|' Match   { ($1,$3) : $5 }
      | catch '|' Match               {% recordError >> return ((errorPattern $1, errorExpr $1) : $3) }
      | catch                         {% recordError >> return [(errorPattern $1, errorExpr $1)] }

-- Parenthesized expression recovery
Atom : '(' Expr ')'                   { $2 }
     | '(' catch ')'                  {% recordError >> return (errorExpr $2) }
     | '[' ExprList ']'               { ... }
     | '[' catch ']'                  {% recordError >> return (noLoc (List [])) }
```

**Synchronization Points (Priority Order):**
1. `end` keyword - closes let/case
2. `in` keyword - separates declarations from body
3. `;` semicolon - expression separator
4. `|` pipe - case arm separator
5. `)`, `]`, `}` - closing delimiters
6. `val`, `fun` - declaration starters

---

## Step 5: Update Main Entry Point

**File:** `compiler/app/Main.hs`

Update `parseProg` to run the new monad stack:

```haskell
parseProg :: FilePath -> String -> Either String Prog
parseProg filename source =
  let env = ParseEnv filename source
      initialState = initialParseState
  in case runExcept (runStateT (runReaderT prog tokens) initialState) of
       Left err -> Left err
       Right (ast, state) ->
         case psErrors state of
           [] -> Right ast
           errs -> Left $ formatAllErrors (reverse errs)
```

---

## Step 6: Handle Error Nodes in Later Stages

**Files:** Various compiler stages

Option A (Recommended): Stop compilation after parsing if errors exist
```haskell
-- In Main.hs, after parsing
case parseProg filename source of
  Left errs -> putStrLn errs >> exitFailure
  Right ast | hasParseErrors ast -> putStrLn "Parse completed with errors" >> exitFailure
  Right ast -> continueCompilation ast
```

Option B: Propagate errors through stages (more complex)

---

## Testing Plan

### New Test Files

Create in `tests/cmp/`:

| File | Content | Expected |
|------|---------|----------|
| `multi-error-let.trp` | Multiple missing `end` | 2+ errors reported |
| `multi-error-case.trp` | Multiple bad case arms | 2+ errors reported |
| `multi-error-mixed.trp` | Various error types | Multiple combined errors |
| `error-limit.trp` | 15+ errors | Limited to 10 |

### Regression Testing

```bash
# Ensure existing tests pass
bin/golden -p cmp

# Test new multi-error cases
bin/golden -p multi-error
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `compiler/src/ParseError.hs` | Add `ParseState`, `formatAllErrors`, error limiting |
| `compiler/src/Parser.y` | New monad, `%error` directive, `catch` productions |
| `compiler/src/Direct.hs` | Add `ErrorPattern`, `ErrorDecl` constructors |
| `compiler/app/Main.hs` | Update to run new monad, handle accumulated errors |
| `tests/cmp/*.trp` | New multi-error test cases |

---

## Risk Mitigation

### Cascading Errors
- **Limit**: Max 10 errors per file
- **Deduplicate**: Skip errors within 2 lines of previous
- **Quality sync points**: Recover at `end`, `in`, `;` (natural boundaries)

### Shift/Reduce Conflicts
- Happy 2.1+ auto-resolves catch conflicts
- Add productions incrementally, test after each
- Use `%shift` pragma if needed

### Later Stage Crashes
- Recommended: Fail compilation if any parse errors exist
- Error nodes should never reach code generation

---

## Estimated Complexity

| Step | Effort | Risk |
|------|--------|------|
| Step 1: Monad changes | Medium | Low |
| Step 2: Error handlers | Medium | Low |
| Step 3: AST nodes | Low | Low |
| Step 4: `catch` productions | High | Medium (conflicts) |
| Step 5: Main.hs | Low | Low |
| Step 6: Later stages | Low | Low |
| Testing | Medium | Low |

**Total: 6-8 focused sessions**
