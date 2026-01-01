{-# LANGUAGE MultiParamTypeClasses #-}
{-# LANGUAGE FlexibleInstances #-}

{-- Obs: 2018-02-16: beacuse of the RetCPS representation, we currently
have very few rewrites that actually kick-in; we should be able to
rectify them with some more work, but that's postponed for now; AA
--}


module RetRewrite(rewrite) where

-- todo: consider renaming this to CPSRewrite


import qualified Basics
import RetCPS as CPS
import qualified Core as C
import Control.Monad.RWS
import Control.Monad.State
import Control.Monad.Writer
import Control.Monad.Reader
import Data.List
import Data.Map.Lazy(Map)
import qualified Data.Map.Lazy as Map
import Control.Monad.Trans.Maybe
import Control.Monad.Identity
import Data.Set (Set)
import qualified Data.Set as Set
import RetFreeVars as FreeVars
import TroupePositionInfo


-- substitution is a collection of both variable substitutions and
-- kont substitutions; 2018-01-23; AA (this is a rather awkward
-- construction; we should have better software engineering)


newtype Subst = Subst (Map VarName VarName)

class Substitutable a where
  apply :: Subst -> a -> a

idSubst :: Subst
idSubst = Subst (Map.empty)


instance Substitutable KLambda where
  apply subst@(Subst (varmap)) kl =
    case kl of
      Unary vn kt ->
        let subst' = Subst (Map.delete vn varmap)
        in  Unary vn (apply subst' kt)
      Nullary kt ->
        let subst' = Subst (varmap)
        in Nullary (apply subst' kt)


instance Substitutable SVal where
  apply _ (Lit lit) = Lit lit
  apply subst (KAbs klambda) = KAbs (apply subst klambda)


instance Substitutable SimpleTerm where
  apply subst@(Subst varmap) simpleTerm =
    case simpleTerm of
      Bin op v1 v2 p -> Bin op (fwd v1) (fwd v2) p
      Un op v p -> Un op (fwd v) p
      Tuple vs p -> Tuple (map fwd vs) p
      Record fields p -> Record (fwdFields fields) p
      WithRecord x fields p -> WithRecord (fwd x) (fwdFields fields) p
      ProjField x f p -> ProjField (fwd x) f p
      ProjIdx x idx p -> ProjIdx (fwd x) idx p
      List vs p -> List (map fwd vs) p
      ListCons v v' p -> ListCons (fwd v) (fwd v') p
      ValSimpleTerm sv p -> ValSimpleTerm (apply subst sv) p
      Base v -> Base v
      Lib l v -> Lib l v
    where fwd x = Map.findWithDefault x x varmap
          fwdFields fields = map (\(f, x) -> (f, fwd x)) fields

instance Substitutable ContDef where
  apply subst@(Subst varmap) (Cont vn kt) =
     let subst' = Subst (Map.delete vn varmap)
     in Cont vn (apply subst' kt)

instance Substitutable FunDef where
  apply subst@(Subst varmap) (Fun vn klam) =
    let subst' = Subst (Map.delete vn varmap)
    in Fun vn (apply subst' klam)


instance Substitutable KTerm where
  apply subst@(Subst varmap) kontTerm =
    case kontTerm of
      LetSimple x st kt p ->
        LetSimple (vfwd x) (apply subst st) (apply subst kt) p

      LetRet kdef@(Cont _ _) kt p ->
        let kdef' = apply subst kdef
            kt'   = apply subst kt
        in LetRet kdef' kt' p

      LetFun fdefs kt p ->
         let fnames = map (\(Fun v _) -> v) fdefs
             subst' = Subst ( foldl (\m v -> Map.delete v m) varmap fnames)
             kt' = apply subst' kt
             fdefs' = map (apply subst') fdefs
         in LetFun fdefs' kt' p


      -- LetRet k kt -> LetRet (kfwd k) (apply subst kt)

      Halt v p -> Halt (vfwd v) p

      KontReturn v p -> KontReturn (vfwd v) p

      ApplyFun fn argn p -> ApplyFun (vfwd fn) (vfwd argn) p

      If v k1 k2 p -> If (vfwd v) (apply subst k1) (apply subst k2) p

      AssertElseError v k1 z p -> AssertElseError (vfwd v) (apply subst k1) (vfwd z) p

      Error x p -> Error (vfwd x) p

   where vfwd x = Map.findWithDefault x x varmap
         -- kfwd x = Map.findWithDefault x x kontmap


data Context -- note this is not an exhaustive set of possible contexts; 2018-01-25; AA
  = CtxtHole
  | CtxtLetSimple VarName SimpleTerm Context
  | CtxtLetCont ContDef Context
  | CtxtLetFunK [FunDef] Context
  | CtxtAssert VarName VarName PosInf Context
--  | CtxtLetRet KontName Context
  deriving (Eq)

retUnchanged :: Context -> Bool
retUnchanged CtxtHole  = True
retUnchanged (CtxtLetSimple  _ _ ctxt) = retUnchanged ctxt
retUnchanged (CtxtLetCont _ _) = True
retUnchanged (CtxtLetFunK _ ctxt) =  retUnchanged ctxt
retUnchanged (CtxtAssert _ _ _ ctxt) = retUnchanged ctxt


data SearchPat = PatReturn
               | PatLetRet
               | PatFunApply VarName


matchterm :: KTerm -> SearchPat -> Maybe (Context, KTerm)

matchterm found@(LetRet _ _ _) (PatLetRet)  =
  return (CtxtHole, found)

matchterm (LetRet _ _ _) PatReturn = Nothing

matchterm found@(KontReturn _ _) (PatReturn) =
  return (CtxtHole, found)

matchterm found@(ApplyFun fn argn _) (PatFunApply fn') | fn == fn' =
  return (CtxtHole, found)



matchterm (LetSimple vn st kt _) searchTerm = do
  (ctxt, found) <- matchterm kt searchTerm
  return $ (CtxtLetSimple vn st ctxt, found)

matchterm (LetFun fdefs kt _) searchTerm = do
  (ctxt, found) <- matchterm kt searchTerm
  return $ (CtxtLetFunK fdefs ctxt, found)

matchterm (LetRet kdef kt _) searchTerm = do
  (ctxt, found) <- matchterm kt searchTerm
  return $ (CtxtLetCont kdef ctxt, found)

matchterm (AssertElseError vn kt vn' pos) searchTerm = do
  (ctxt, found) <- matchterm kt searchTerm
  return $ (CtxtAssert vn vn' pos ctxt, found)


matchterm _ _ = Nothing




--- this is the inverse of match: allows us to reconstruct the term back
--- from the contxt and the term inside

reconstructTerm :: Context -> KTerm -> KTerm
reconstructTerm CtxtHole kt  = kt
reconstructTerm (CtxtLetSimple vn st ctxt) kt =
  LetSimple vn st (reconstructTerm ctxt kt) NoPos
reconstructTerm (CtxtLetCont kdef ctxt) kt =
  LetRet kdef (reconstructTerm ctxt kt) NoPos
reconstructTerm (CtxtLetFunK fdefs ctxt) kt =
  LetFun fdefs (reconstructTerm ctxt kt) NoPos
reconstructTerm (CtxtAssert vn vn' pos ctxt) kt =
  AssertElseError vn (reconstructTerm ctxt kt) vn' pos


class KWalkable a b where
  walk :: (b -> Bool) -> (b -> b) -> a -> a

instance (KWalkable KTerm KTerm) where
  walk pred f kt =
    if pred kt then f kt
    else
      let w' = walk pred f
      in
       case kt of
         LetSimple vn st kt' p -> LetSimple vn (walk pred f st) (w' kt') p
         LetRet cdef kt' p   -> LetRet  (walk pred f cdef) (w' kt') p
         LetFun fdefs kt' p   -> LetFun (map (walk pred f) fdefs) (w' kt') p
         If v k1 k2 p         -> If v (w' k1) (w' k2) p
         AssertElseError v k1 z p -> AssertElseError v (w' k1) z p
         -- LetRet kn kt'       -> LetRet kn (w' kt')
         -- these do not modify anything
         KontReturn v p  -> KontReturn v p
         Halt v p -> Halt v p
         ApplyFun v a1 p -> ApplyFun v a1 p
         Error x p -> Error x p



instance (KWalkable KLambda KTerm) where
  walk pred f (Unary vn kt) =
    Unary vn (walk pred f kt)
  walk pred f (Nullary kt) =
    Nullary (walk pred f kt)


instance (KWalkable SimpleTerm KTerm) where
  walk pred f st =
    case st of
        ValSimpleTerm (KAbs klam) p ->
          ValSimpleTerm (KAbs (walk pred f klam)) p
        _ -> st

instance KWalkable ContDef KTerm where
  walk pred f (Cont vn kt) = Cont vn (walk pred f kt)


instance KWalkable FunDef KTerm where
  walk pred f (Fun v klam) = Fun v (walk pred f klam)



--------------------------------------------------
-- free vars
--------------------------------------------------




instance FreeNames Context where
  freeVars CtxtHole = emptyFreeVars
  freeVars (CtxtLetSimple vn st ctxt) = freeOfLet st [vn] ctxt
  freeVars (CtxtLetCont cdef@(Cont vn kt') ctxt) = freeOfLet cdef [vn] ctxt
  freeVars (CtxtLetFunK fdefs ctxt) =
      (unionMany (map freeVars fdefs)) `unionFreeVars` (restrictFree ctxt  (map fname fdefs))
        where fname (Fun n _) = n
  freeVars (CtxtAssert vn1 vn2 _ ctxt) = unionMany [freeVars ctxt, FreeVars $ Set.fromList [vn1, vn2]]

-- todo: eliminate redundancy in code ; 2018-01-25 ; aa


--------------------------------------------------
-- REWRITES
--------------------------------------------------

betaContPred (LetRet _ _ _) = True
betaContPred _ = False


betaCont :: KTerm -> KTerm
betaCont (LetRet cdef@(Cont xn kt) kt' p) =
  let cdef' = walk betaContPred betaCont cdef
  in
    case matchterm kt' PatReturn of
                  Just (ctxt, KontReturn yn _) ->
                       let kt'' = let subst = Subst ( Map.fromList ([(xn, yn)] ) )
                                  in reconstructTerm ctxt (apply subst kt)
                       in if retUnchanged ctxt
                          then kt''
                          else LetRet cdef' kt'' p
                  _ -> LetRet cdef'  (walk betaContPred betaCont kt') p

betaCont _ = error "should not be called here"

--------------------------------------------------
-- Dead-Cont
--------------------------------------------------

-- deadContPred (LetRet _ _) = True
deadContPred _ = False

-- deadCont (LetRet cdef@(Cont _ kt) kt') =
--     let FreeVars (_, freeKs) = freeVars kt'
--     in if not (Set.member kn freeKs) then (walk deadContPred deadCont kt')
--        else
--            let cdef' = walk deadContPred deadCont cdef
--            in LetRet cdef' (walk deadContPred deadCont kt')


--------------------------------------------------
-- β-Fun (-Lin)
--------------------------------------------------

betaFunPred (LetFun [Fun fn (Unary vn kt')] kt _) = True
betaFunPred (LetSimple fn (ValSimpleTerm (KAbs (Unary vn kt')) _) kt _) = True
betaFunPred _ = False

betaFun :: KTerm -> KTerm
betaFun (LetFun [Fun fn klam@(Unary xn kt)] kt' p) =
  let klam' = walk betaFunPred betaFun klam
      noChange = LetFun [Fun fn klam'] (walk betaFunPred betaFun kt') p
  in
     case matchterm kt' (PatFunApply fn) of
       Just (ctxt, ApplyFun _ yn _) ->
          let kt'' = let subst = Subst (Map.fromList [(xn, yn)])
                     in reconstructTerm ctxt (apply subst kt)
              FreeVars ( freeVsCtxt ) = freeVars ctxt
              FreeVars ( freeVsKt ) = freeVars kt

          in if (not (Set.member fn (freeVsCtxt `Set.union` freeVsKt))) && ( fn /= yn)
             then kt''
             else noChange
       _ -> noChange


betaFun (LetSimple fn (ValSimpleTerm (KAbs klam@(Unary xn kt)) p1) kt' p2) =
  let klam' = walk betaFunPred betaFun klam
      noChange = LetSimple fn (ValSimpleTerm (KAbs klam') p1) (walk betaFunPred betaFun kt') p2
  in
     case matchterm kt' (PatFunApply fn) of
       Just (ctxt, ApplyFun _ yn _) ->
          let kt'' = let subst = Subst (Map.fromList [(xn, yn)])
                     in reconstructTerm ctxt (apply subst kt)
              FreeVars ( freeVsCtxt ) = freeVars ctxt
              FreeVars ( freeVsKt ) = freeVars kt

          in if (not (Set.member fn (freeVsCtxt `Set.union` freeVsKt))) && ( fn /= yn)
             then kt''
             else noChange
       _ -> noChange



betaFun _ = error "this should not be called"


--------------------------------------------------
-- putting it all together ...



contextualRewrites = [ (betaFunPred, betaFun)
                     , (betaContPred, betaCont)
                     -- ,(deadContPred, deadCont)
                     ]


ktWalk :: KTerm -> KTerm
ktWalk kt =
   let rewrites = 
          map (\(pred, f) -> walk pred f) contextualRewrites
   in
    foldl (\t rwrt -> rwrt t) kt rewrites


ktWalkFix kt =
    let kt' = ktWalk kt
    in if kt' == kt then kt
       else ktWalkFix kt'

rewrite :: Prog -> Prog
rewrite (Prog atoms kterm) = Prog atoms (ktWalkFix kterm)
