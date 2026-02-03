{-# LANGUAGE OverloadedStrings #-}

module TroupeSourceMap
    ( collectMapping
    , buildSourceMap
    , emptySourceMap
    ) where

import SourceMap (generate)
import SourceMap.Types (SourceMapping(..), Mapping(..), Pos(..))
import TroupePositionInfo (PosInf(..))
import Data.Aeson (Value)

-- | Convert a source position to a source map mapping
-- genLine and genCol are 1-based (matching line numbers in output)
-- The source map spec uses 0-based columns, so we adjust
collectMapping :: PosInf -> Int -> Int -> Maybe Mapping
collectMapping (SrcPosInf srcFile srcLine srcCol) genLine genCol =
    Just $ Mapping
        { mapGenerated = Pos (fromIntegral genLine) (fromIntegral $ genCol - 1)
        , mapOriginal = Just $ Pos (fromIntegral srcLine) (fromIntegral $ srcCol - 1)
        , mapSourceFile = Just srcFile
        , mapName = Nothing
        }
collectMapping _ _ _ = Nothing

-- | Build a source map JSON value from a list of mappings
buildSourceMap :: FilePath -> [Mapping] -> Value
buildSourceMap outFile mappings = generate $ SourceMapping
    { smFile = outFile
    , smSourceRoot = Nothing
    , smMappings = mappings
    }

-- | Build an empty source map (for Phase 1)
emptySourceMap :: FilePath -> Value
emptySourceMap outFile = buildSourceMap outFile []
