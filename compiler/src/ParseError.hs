{-# LANGUAGE RecordWildCards #-}
-- | Parse error formatting with source context display
module ParseError
  ( ParseErrorInfo(..)
  , ParseEnv(..)
  , formatParseError
  , getSourceLine
  , makeCaretLine
  ) where

import Data.List (intercalate)
import Lexer (Token, showToken)

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
    contextLine = case peiContext of
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
