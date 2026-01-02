{-# LANGUAGE TypeSynonymInstances #-}
{-# LANGUAGE FlexibleInstances #-}

module RetFreeVars where

import qualified Basics
import RetCPS as CPS
import qualified Core as C
import Data.List
import Data.Map.Lazy(Map)
import qualified Data.Map.Lazy as Map
import Control.Monad.Trans.Maybe
import Control.Monad.Identity
import Data.Set (Set)
import qualified Data.Set as Set
import TroupePositionInfo (Located(..), getLoc, unLoc)

newtype FreeVars = FreeVars (Set VarName)

class FreeNames a where
  freeVars :: a -> FreeVars


unionFreeVars :: FreeVars -> FreeVars -> FreeVars
unionFreeVars (FreeVars s) (FreeVars u) =
   FreeVars (s `Set.union` u)

emptyFreeVars = FreeVars Set.empty

-- obs: not tested; 2018-01-25 ; aa
unionMany :: [FreeVars] -> FreeVars
unionMany = foldl unionFreeVars emptyFreeVars

restrictFree x vs =
  let FreeVars (fv) = freeVars x
  in FreeVars ( fv Set.\\ Set.fromList vs )


instance FreeNames KLambda where
  freeVars (Unary vn _ lkt) = restrictFree lkt [vn]
  freeVars (Nullary  lkt) = restrictFree lkt []

instance FreeNames LKTerm where
  freeVars (Loc _ kt) = freeVars kt

instance FreeNames SVal where
  freeVars (KAbs klam) = freeVars klam
  freeVars (Lit (C.LAtom nm)) = FreeVars (Set.singleton $ VN nm)
  freeVars _ = emptyFreeVars

instance FreeNames ContDef where
  freeVars  (Cont vn lkt) = restrictFree lkt [vn]

instance FreeNames FunDef where
  freeVars (Fun fn klam) = restrictFree klam [fn]

instance FreeNames (Located FunDef) where
  freeVars (Loc _ fd) = freeVars fd

instance FreeNames SimpleTerm where
  freeVars (Bin _ v1 v2) = FreeVars (Set.fromList [v1, v2])
  freeVars (Un _ v) = FreeVars (Set.singleton v)
  freeVars (ValSimpleTerm sval) = freeVars sval
  freeVars (Tuple vs) = FreeVars (Set.fromList vs)
  freeVars (List vs)  = FreeVars (Set.fromList vs)
  freeVars (ListCons v1 v2) = FreeVars (Set.fromList [v1, v2])
  freeVars (Base _ ) = FreeVars $ Set.empty
  freeVars (Lib _ _) = FreeVars $ Set.empty
  freeVars (Record fields) = unionMany $
      map (\(f,x) -> FreeVars (if x == VN f then Set.empty else Set.singleton x))
      fields
  freeVars (WithRecord x fields) =
    let _f = map (\(f,x) -> FreeVars ( if x == VN f then Set.empty else Set.singleton x)) fields in
    unionMany $ (FreeVars (Set.singleton x)): _f
  freeVars (ProjField x _) = FreeVars (Set.singleton x)
  freeVars (ProjIdx x _) = FreeVars (Set.singleton x)

instance FreeNames LSimpleTerm where
  freeVars (Loc _ st) = freeVars st

freeOfLet d vs lkt =
   (freeVars d) `unionFreeVars` (restrictFree lkt vs)

instance FreeNames KTerm where
  freeVars (Error v _) = FreeVars (Set.singleton v)

  freeVars (LetSimple vn lst lkt) = freeOfLet lst [vn] lkt

  freeVars (LetRet (Cont vn lkt') lkt) = freeOfLet lkt [vn] lkt'

  freeVars (LetFun lfdefs lkt) =
     (unionMany (map freeVars lfdefs)) `unionFreeVars` (restrictFree lkt  (map fname lfdefs))
        where fname (Loc _ (Fun n _)) = n

  freeVars (KontReturn v) = FreeVars (Set.singleton v)

--   freeVars (LetRet cdef@(Cont vn _) kt) =  freeOfLet cdef [vn] kt

  freeVars (ApplyFun fn vn) = FreeVars (Set.fromList [fn, vn])

  freeVars (If vn lk1 lk2) =
     unionMany [freeVars lk1, freeVars lk2, FreeVars (Set.singleton vn)]

  freeVars (AssertElseError vn lk ve _) =
     unionMany [freeVars lk, FreeVars $ Set.fromList [vn, ve] ]

  freeVars (Halt x) = FreeVars (Set.singleton x)
