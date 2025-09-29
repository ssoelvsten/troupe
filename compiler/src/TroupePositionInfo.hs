{-# LANGUAGE DefaultSignatures #-}
{-# LANGUAGE DeriveGeneric #-}

module TroupePositionInfo
where

import Data.Serialize (Serialize)
import GHC.Generics (Generic)

data PosInf
    = SrcPosInf String Int Int
    | RTGen String
    | NoPos
    deriving (Eq, Generic, Ord)

instance Serialize PosInf

instance Show PosInf where
    show (SrcPosInf filename row col) = filename ++ ":" ++ (show row) ++ ":" ++ (show col)
    show (RTGen s) = "RTGen<" ++ s ++ ">"
    show NoPos = ""

class GetPosInfo a where
    posInfo :: a -> PosInf

instance GetPosInfo PosInf where
    posInfo x = x
