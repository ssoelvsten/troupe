{-# LANGUAGE FlexibleContexts #-}

-- | Unified pretty printing infrastructure for Troupe compiler.
--
-- This module provides a Reader monad-based approach to pretty printing
-- that enables configurable output, including optional position annotations.
--
-- Key features:
-- - Configurable position display (inline, comment, bracket formats)
-- - Reader monad for threading configuration through pretty printers
-- - Generic 'ppLocated' combinator for handling Located values
-- - Backward-compatible default that hides positions
--
-- Usage pattern for IR modules:
--
-- @
-- import PrettyPrint
--
-- ppLTerm :: Precedence -> LTerm -> PP Doc
-- ppLTerm prec = ppLocated (ppTerm prec)  -- Position now tracked!
--
-- ppTerm :: Precedence -> Term -> PP Doc
-- ppTerm prec term = case term of
--   Var vn -> pure $ text (show vn)
--   ...
-- @

module PrettyPrint
  ( -- * Configuration
    PPConfig(..)
  , PosFormat(..)
  , defaultPPConfig
  , debugPPConfig

    -- * The PP monad
  , PP
  , runPP
  , runPPDefault
  , runPPDebug

    -- * Config accessors
  , askShowPositions
  , askPosFormat
  , askIndentWidth

    -- * Position annotation
  , annotatePos
  , ppLocated

    -- * Monadic combinators
  , (<+>>)
  , (<<+>)
  , ($$>)
  , (<$$>)
  , nestPP
  , vcatPP
  , vcatMapPP
  , hsepPP
  , hcatPP
  , punctuatePP

    -- * Re-export HughesPJ types and combinators
  , PP.Doc
  , PP.text
  , PP.char
  , PP.int
  , PP.integer
  , PP.empty
  , PP.parens
  , PP.brackets
  , PP.braces
  , PP.quotes
  , PP.doubleQuotes
  , PP.nest
  , PP.hang
  , PP.punctuate
  , PP.sep
  , PP.cat
  , PP.fsep
  , PP.fcat
  , PP.hsep
  , PP.hcat
  , PP.vcat
  , (PP.<+>)
  , (PP.<>)
  , (PP.$$)
  , PP.render
  , PP.renderStyle
  , PP.style
  , PP.Style(..)
  , PP.Mode(..)
  , PP.isEmpty
  , PP.comma
  , PP.colon
  , PP.semi
  , PP.equals
  , PP.lparen
  , PP.rparen
  , PP.lbrack
  , PP.rbrack
  , PP.lbrace
  , PP.rbrace
  , PP.maybeParens
  )
where

import Control.Monad (liftM2)
import Control.Monad.Reader
import qualified Text.PrettyPrint.HughesPJ as PP
import Text.PrettyPrint.HughesPJ (Doc, (<+>), ($$))
import TroupePositionInfo (PosInf(..), Located(..), getLoc, unLoc)


-- | Configuration for pretty printing
data PPConfig = PPConfig
  { ppShowPositions :: Bool      -- ^ Include position annotations in output
  , ppIndentWidth   :: Int       -- ^ Indentation width (default: 2)
  , ppLineWidth     :: Int       -- ^ Target line width for wrapping (default: 80)
  , ppVerbose       :: Bool      -- ^ Verbose output mode
  , ppPosFormat     :: PosFormat -- ^ How to format position annotations
  }
  deriving (Show, Eq)

-- | Format options for position annotations
data PosFormat
  = PosInline      -- ^ term @file:line:col
  | PosComment     -- ^ term /* file:line:col */
  | PosBracket     -- ^ [file:line:col] term
  | PosNone        -- ^ No position output (ignore config)
  deriving (Show, Eq)

-- | Default configuration: no positions shown
defaultPPConfig :: PPConfig
defaultPPConfig = PPConfig
  { ppShowPositions = False
  , ppIndentWidth   = 2
  , ppLineWidth     = 80
  , ppVerbose       = False
  , ppPosFormat     = PosInline
  }

-- | Debug configuration: positions shown in inline format
debugPPConfig :: PPConfig
debugPPConfig = defaultPPConfig { ppShowPositions = True }


-- | The pretty printing monad, threading configuration implicitly
type PP a = Reader PPConfig a


-- | Run pretty printing with a specific configuration
runPP :: PPConfig -> PP Doc -> Doc
runPP cfg m = runReader m cfg

-- | Run pretty printing with default configuration (no positions)
runPPDefault :: PP Doc -> Doc
runPPDefault = runPP defaultPPConfig

-- | Run pretty printing with debug configuration (positions shown)
runPPDebug :: PP Doc -> Doc
runPPDebug = runPP debugPPConfig


-- | Check if positions should be shown
askShowPositions :: PP Bool
askShowPositions = asks ppShowPositions

-- | Get the position format
askPosFormat :: PP PosFormat
askPosFormat = asks ppPosFormat

-- | Get the indentation width
askIndentWidth :: PP Int
askIndentWidth = asks ppIndentWidth


-- | Format a position according to the format setting
formatPos :: PosFormat -> PosInf -> Doc
formatPos _ NoPos = PP.empty
formatPos PosNone _ = PP.empty
formatPos _ (RTGen s) = PP.text $ " @RTGen<" ++ s ++ ">"
formatPos PosInline (SrcPosInf f l c) =
  PP.text $ " @" ++ f ++ ":" ++ show l ++ ":" ++ show c
formatPos PosComment (SrcPosInf f l c) =
  PP.text $ " /* " ++ f ++ ":" ++ show l ++ ":" ++ show c ++ " */"
formatPos PosBracket (SrcPosInf f l c) =
  PP.brackets (PP.text $ f ++ ":" ++ show l ++ ":" ++ show c) <+> PP.empty


-- | Annotate a Doc with position info based on current configuration
annotatePos :: PosInf -> Doc -> PP Doc
annotatePos pos doc = do
  showPos <- askShowPositions
  fmt <- askPosFormat
  if not showPos
    then return doc
    else return $ doc PP.<> formatPos fmt pos


-- | Generic helper for pretty printing Located values.
--
-- This is the key combinator that eliminates boilerplate.
-- Instead of:
--
-- @
-- ppLTerm prec (Loc _ t) = ppTerm prec t  -- Position discarded!
-- @
--
-- Write:
--
-- @
-- ppLTerm prec = ppLocated (ppTerm prec)  -- Position preserved!
-- @
ppLocated :: (a -> PP Doc) -> Located a -> PP Doc
ppLocated ppInner loc = do
  doc <- ppInner (unLoc loc)
  annotatePos (getLoc loc) doc


-- | Lifted horizontal composition with space
infixl 6 <+>>
(<+>>) :: PP Doc -> PP Doc -> PP Doc
(<+>>) = liftM2 (<+>)

-- | Lifted horizontal composition with space (flipped argument order for chaining)
infixl 6 <<+>
(<<+>) :: PP Doc -> PP Doc -> PP Doc
(<<+>) = liftM2 (<+>)

-- | Lifted vertical composition
infixl 5 $$>
($$>) :: PP Doc -> PP Doc -> PP Doc
($$>) = liftM2 ($$)

-- | Lifted vertical composition (alias for readability)
infixl 5 <$$>
(<$$>) :: PP Doc -> PP Doc -> PP Doc
(<$$>) = liftM2 ($$)


-- | Nest with config-aware indentation
nestPP :: PP Doc -> PP Doc
nestPP inner = do
  width <- askIndentWidth
  doc <- inner
  return $ PP.nest width doc

-- | Lifted vcat
vcatPP :: [PP Doc] -> PP Doc
vcatPP = fmap PP.vcat . sequence

-- | Map and vcat
vcatMapPP :: (a -> PP Doc) -> [a] -> PP Doc
vcatMapPP f xs = vcatPP (map f xs)

-- | Lifted hsep
hsepPP :: [PP Doc] -> PP Doc
hsepPP = fmap PP.hsep . sequence

-- | Lifted hcat
hcatPP :: [PP Doc] -> PP Doc
hcatPP = fmap PP.hcat . sequence

-- | Lifted punctuate
punctuatePP :: Doc -> [PP Doc] -> PP [Doc]
punctuatePP p docs = do
  ds <- sequence docs
  return $ PP.punctuate p ds
