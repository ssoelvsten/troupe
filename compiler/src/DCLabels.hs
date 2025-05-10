{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DefaultSignatures #-}
{-# LANGUAGE LambdaCase #-}


module DCLabels where
import GHC.Generics(Generic)
import Data.Serialize (Serialize)
import Data.List (sort, nub)
import Data.Char (toLower)

type Tag = String
data LabelOp = Conj | Disj
     deriving (Eq, Generic, Ord)

data LabelExp
     = TagExp Tag
     | OpExp LabelOp LabelExp LabelExp
     deriving (Eq, Generic, Ord)

newtype DisjTags = DisjTags [Tag]
     deriving (Eq, Generic, Ord, Show)

newtype CNF = CNF [DisjTags]
     deriving (Eq, Generic, Ord, Show)


--- Normalization and conversion from labelExp to CNF 
--- 


--- Auxiliary functions 
lowerString = map toLower
snub = sort.nub


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
    in CNF $ nub $
         case op of
           Conj -> c1 ++ c2
           Disj ->
             [DisjTags $ snub (d1 ++ d2)
                 | DisjTags d1 <- c1, DisjTags d2 <- c2 ]

newtype DCLabel = DCLabel (CNF,CNF)
     deriving (Eq, Generic, Ord, Show)

instance Show LabelOp where
  show Conj = "&"
  show Disj = "|"


opPrec :: LabelOp -> Int
opPrec Conj = 100
opPrec Disj = 10

instance Serialize DisjTags
instance Serialize CNF
instance Serialize DCLabel