{-# LANGUAGE RecordWildCards #-}
-- | Parse error formatting with source context display
module ParseError
  ( ParseErrorInfo(..)
  , ParseEnv(..)
  , formatParseError
  , getSourceLine
  , makeCaretLine
  , inferContext
  ) where

import Data.List (intercalate)
import Control.Applicative ((<|>))
import Lexer (Token(..), showToken)

-- | Environment for parsing (filename + source text)
data ParseEnv = ParseEnv
  { peFilename :: String
  , peSource   :: String
  } deriving (Eq, Show)

-- | Complete information about a parse error
data ParseErrorInfo = ParseErrorInfo
  { peiFilename    :: String       -- ^ Source file name
  , peiLine        :: Int          -- ^ Line number (1-indexed)
  , peiColumn      :: Int          -- ^ Column number (1-indexed)
  , peiToken       :: Maybe Token  -- ^ The unexpected token (Nothing for EOF)
  , peiExpected    :: [String]     -- ^ List of expected token names
  , peiSourceLines :: [String]     -- ^ All source lines for context
  , peiContext     :: Maybe String -- ^ Parse context (e.g., "let expression")
  }

-- | Extract a source line (1-indexed)
getSourceLine :: [String] -> Int -> Maybe String
getSourceLine sourceLines lineNum
  | lineNum > 0 && lineNum <= length sourceLines = Just (sourceLines !! (lineNum - 1))
  | otherwise = Nothing

-- | Create a caret line pointing to the error column (1-indexed)
makeCaretLine :: Int -> String
makeCaretLine col = replicate (col - 1) ' ' ++ "^"

-- | Format a complete error message with source context
formatParseError :: ParseErrorInfo -> String
formatParseError ParseErrorInfo{..} = unlines $ filter (not . null)
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
    -- Location header: "filename:line:col: parse error"
    locationLine = prefix ++ show peiLine ++ ":" ++ show peiColumn ++ ": parse error"
    prefix = if null peiFilename then "" else peiFilename ++ ":"

    -- Context line: "  (while parsing let expression)"
    -- Auto-infer context if not explicitly provided
    contextLine = case peiContext <|> inferContext peiExpected peiToken of
      Just ctx -> "  (while parsing " ++ ctx ++ ")"
      Nothing  -> ""

    -- Source line with line number: "  5 | in  val _ = ..."
    sourceLine = case getSourceLine peiSourceLines peiLine of
      Just line -> "  " ++ lineNumStr ++ " | " ++ expandTabs line
      Nothing   -> ""

    lineNumStr = show peiLine
    lineNumWidth = length lineNumStr

    -- Caret line pointing to error column
    caretLine = case getSourceLine peiSourceLines peiLine of
      Just line ->
        let tabAdjustedCol = adjustForTabs line peiColumn
        in  "  " ++ replicate lineNumWidth ' ' ++ " | " ++ makeCaretLine tabAdjustedCol
      Nothing -> ""

    -- "unexpected keyword 'val'" or "unexpected end of input"
    unexpectedLine = case peiToken of
      Just tok -> "  unexpected " ++ showToken tok
      Nothing  -> "  unexpected end of input"

    -- "expected identifier, 'fun', or expression"
    expectedLine = case peiExpected of
      []  -> ""
      [e] -> "  expected " ++ e
      es  -> "  expected one of: " ++ intercalate ", " es

-- | Expand tabs to spaces (4 spaces per tab, standard)
expandTabs :: String -> String
expandTabs = concatMap expandTab
  where
    expandTab '\t' = "    "
    expandTab c    = [c]

-- | Adjust column position to account for tabs before the error position
adjustForTabs :: String -> Int -> Int
adjustForTabs line col = go 1 1 line
  where
    go srcCol displayCol [] = displayCol
    go srcCol displayCol (c:cs)
      | srcCol >= col = displayCol
      | c == '\t'     = go (srcCol + 1) (displayCol + 4) cs
      | otherwise     = go (srcCol + 1) (displayCol + 1) cs

-- | Infer parsing context from expected tokens
-- This provides "while parsing X" hints without requiring a full context stack
-- Order matters: more specific contexts should come before general ones
inferContext :: [String] -> Maybe Token -> Maybe String
inferContext expected maybeToken = firstJust
  [ checkValInExprContext  -- 'val' where expression expected (common mistake)
  , checkIfContext         -- Check if/then/else first (more specific than pattern)
  , checkRaiseContext      -- raise...to
  , checkCaseContext       -- case...of with | and =>
  , checkLetContext        -- let declarations
  , checkDCLabelContext    -- DC labels
  , checkRecordContext     -- record literals
  , checkListContext       -- list literals
  , checkFunctionContext   -- fn => (general)
  , checkPatternContext    -- patterns (most general, check last)
  ]
  where
    firstJust = foldr (<|>) Nothing

    -- 'val' or 'fun' appearing where expression is expected (after 'in')
    -- This is the most common mistake: forgetting 'end' before 'in'
    checkValInExprContext
      | Just tok <- maybeToken
      , isValOrFun tok
      , "keyword 'let'" `elem` expected  -- Expecting expression start
      , "keyword 'val'" `notElem` expected  -- But val is not expected
      , "keyword 'fun'" `notElem` expected  -- And fun is not expected
      = Just "let expression body"
      | otherwise = Nothing

    isValOrFun TokenVal = True
    isValOrFun TokenFun = True
    isValOrFun _ = False

    -- In if expression (expecting then/else)
    checkIfContext
      | "keyword 'then'" `elem` expected = Just "if expression"
      | "keyword 'else'" `elem` expected = Just "if expression"
      | otherwise = Nothing

    -- In raise expression
    checkRaiseContext
      | "keyword 'to'" `elem` expected = Just "raise expression"
      | otherwise = Nothing

    -- In case expression (expecting | or =>)
    checkCaseContext
      | "'|'" `elem` expected, "'=>'" `elem` expected = Just "case expression"
      | otherwise = Nothing

    -- In let declarations (expecting val/fun/end)
    checkLetContext
      | any (`elem` expected) ["keyword 'val'", "keyword 'fun'", "keyword 'end'"]
      , "keyword 'in'" `notElem` expected = Just "let declarations"
      | "keyword 'end'" `elem` expected
      , "keyword 'in'" `elem` expected = Just "let expression"
      | otherwise = Nothing

    -- In DC label (expecting >`)
    checkDCLabelContext
      | dcLabelEnd `elem` expected = Just "DC label"
      | otherwise = Nothing
      where
        dcLabelEnd = "'>`' (DC label end)"

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

    -- In function definition (expecting =>)
    checkFunctionContext
      | "'=>'" `elem` expected = Just "function or pattern match"
      | otherwise = Nothing

    -- In pattern (expecting = after pattern) - most general, check last
    checkPatternContext
      | "'='" `elem` expected
      , "keyword 'val'" `notElem` expected
      , "keyword 'fun'" `notElem` expected
      , "keyword 'then'" `notElem` expected  -- Not if expression
      , "keyword 'else'" `notElem` expected  -- Not if expression
      = Just "pattern"
      | otherwise = Nothing
