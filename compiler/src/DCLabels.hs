{-# LANGUAGE DefaultSignatures #-}
{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE LambdaCase #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE RecordWildCards #-}
{-# OPTIONS_GHC -Wno-unrecognised-pragmas #-}

{-# HLINT ignore "Use newtype instead of data" #-}

module DCLabels (
    DCLabelExp (..),
    LabelExp (..),
    LabelOp (..),
    LabelConst (..),
    ppDCLabelExp,
    ppDCLabelExpLit,
    labelExpToCNF,
    dcLabelExpToDCLabel,
) where

import Data.Aeson
import Data.Char (toLower)
import Data.List (nub, sort)
import Data.Serialize (Serialize)
import GHC.Generics (Generic)
import Text.PrettyPrint.HughesPJ (
    hsep,
    nest,
    text,
    vcat,
    ($$),
    (<+>),
 )
import qualified Text.PrettyPrint.HughesPJ as PP

type Tag = String
data LabelOp = Conj | Disj
    deriving (Eq, Generic, Ord)

data LabelExp
    = TagExp Tag
    | OpExp LabelOp LabelExp LabelExp
    deriving (Eq, Generic, Ord)

data LabelConst = LabelTrue | LabelFalse
    deriving (Eq, Generic, Ord)

instance Show LabelConst where
    show LabelTrue = "#true"
    show LabelFalse = "#false"

newtype DisjTags = DisjTags [Tag]
    deriving (Eq, Generic, Ord, Show)

newtype CNF = CNF [DisjTags]
    deriving (Eq, Generic, Ord, Show)

--- Normalization and conversion from labelExp to CNF
---

--- Auxiliary functions
lowerString = map toLower
snub = sort . nub

--- Syntactic normalization of a list of disjunctions
-- lowercases, sorts, and removes duplicates

normDisj :: DisjTags -> DisjTags
normDisj (DisjTags t) =
    DisjTags $ snub (map lowerString t)

--- Syntactic normalizsation of conjunctions
--- (removes duplicates)
syntaxNorm :: CNF -> CNF
syntaxNorm (CNF c) = CNF $ nub (map normDisj c)

--- Conversion from labelExps to CNF

labelExpToCNF :: LabelExp -> CNF
labelExpToCNF (TagExp t) = CNF [DisjTags [lowerString t]]
labelExpToCNF (OpExp op e1 e2) =
    let CNF c1 = labelExpToCNF e1
        CNF c2 = labelExpToCNF e2
     in CNF $
            nub $
                case op of
                    Conj -> c1 ++ c2
                    Disj ->
                        [ DisjTags $ snub (d1 ++ d2)
                        | DisjTags d1 <- c1
                        , DisjTags d2 <- c2
                        ]

newtype DCLabel = DCLabel (CNF, CNF)
    deriving (Eq, Generic, Ord, Show)

-- DCLabelExp corresponds to the label as it appears in the source; we
-- therefore keep the string representation for potential use in error
-- reporting (2025-05-13; AA)

-- data DCLabelExp = DCLabelExp String (LabelExp, LabelExp)
type DCLabOrConst = Either LabelExp LabelConst
newtype DCLabelExp
    = DCLabelExp (DCLabOrConst, DCLabOrConst)
    deriving (Eq, Generic, Ord)

labelConstToCNF :: LabelConst -> CNF
labelConstToCNF (LabelTrue) = CNF []
labelConstToCNF (LabelFalse) = CNF [DisjTags []]

dcLabelExpToDCLabel :: DCLabelExp -> DCLabel
dcLabelExpToDCLabel (DCLabelExp (e1, e2)) =
    let f e = case e of
            Left le -> labelExpToCNF le
            Right lc -> labelConstToCNF lc
     in DCLabel (f e1, f e2)

-- instance Show DCLabelExp where
--     show (DCLabelExp s ) = s

instance Show LabelOp where
    show Conj = "&"
    show Disj = "|"

opPrec :: LabelOp -> Int
opPrec Conj = 100
opPrec Disj = 10

instance Serialize LabelConst
instance Serialize LabelOp
instance Serialize DisjTags
instance Serialize CNF
instance Serialize DCLabel
instance Serialize LabelExp
instance Serialize DCLabelExp

-- pretty printing
--

ppLabelExp' :: Int -> LabelExp -> PP.Doc
ppLabelExp' _ (TagExp t) = text t
ppLabelExp' parenPrec (OpExp o e1 e2) =
    let thisPrec = opPrec o
        thisTxt = (text . show) o
        p1 = ppLabelExp' thisPrec e1
        p2 = ppLabelExp' thisPrec e2
     in PP.maybeParens (thisPrec < parenPrec) $
            hsep [p1, thisTxt, p2]

ppLabelExp :: LabelExp -> PP.Doc
ppLabelExp = ppLabelExp' 0

ppDCLabelExp :: DCLabelExp -> PP.Doc
ppDCLabelExp (DCLabelExp (e1, e2)) =
    hsep
        [ text "<"
        , ppMLabelExp e1
        , text ";"
        , ppMLabelExp e2
        , text ">"
        ]
  where
    ppMLabelExp (Left e) = ppLabelExp e
    ppMLabelExp (Right s) = text (show s)

ppDCLabelExpLit e =
    text "`" PP.<> (ppDCLabelExp e) PP.<> text "`"

instance Show LabelExp where
    show = PP.render . ppLabelExp

instance Show DCLabelExp where
    show = PP.render . ppDCLabelExp

instance ToJSON DisjTags where
    toJSON (DisjTags ts) = toJSON ts
instance ToJSON CNF where
    toJSON (CNF cats) =
        toJSON (map toJSON cats)

instance ToJSON DCLabel where
    toJSON (DCLabel (c, i)) =
        object
            [ "confidentiality" .= c
            , "integrity" .= i
            ]
