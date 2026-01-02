{-# LANGUAGE MultiParamTypeClasses #-}
{-# LANGUAGE FlexibleInstances #-}
{-# LANGUAGE FlexibleContexts #-}
{-- Obs: 2018-02-16: beacuse of the RetCPS representation, we currently
have very few rewrites that actually kick-in; we should be able to
rectify them with some more work, but that's postponed for now; AA
--}


module CPSOpt (rewrite) where

-- todo: consider renaming this to CPSRewrite

import Debug.Trace
import qualified Basics
import RetCPS as CPS
import qualified Core as C
import Core (Numeric(..))
import Control.Monad.RWS
import Control.Monad.State
import Control.Monad.Writer
import Control.Monad.Reader
import Data.List

import Data.Map.Lazy(Map)

import qualified Data.Map.Lazy as Map

import Control.Monad.Trans.Maybe
import Control.Monad.Identity ()

import Data.Set (Set)

import qualified Data.List 
import qualified Data.Maybe 

import qualified Data.Set as Set
import RetFreeVars as FreeVars
import TroupePositionInfo

-- 2025-06-23: AA+cc
-- Helper function to get the last occurrence of a key in an association list.
-- This is needed for correct record field resolution when duplicate field names exist.
-- In Troupe, record field semantics follow "last assignment wins" (e.g., {x=100, x=200}.x should return 200),
-- but Haskell's standard 'lookup' returns the first match. This function ensures we get the last match
-- by reversing the list before lookup, which gives us the rightmost (last) field value.
lookupLast :: Eq a => a -> [(a, b)] -> Maybe b
lookupLast key pairs = lookup key (reverse pairs)



newtype Subst = Subst (Map VarName VarName)

class Substitutable a where
  apply :: Subst -> a -> a

idSubst :: Subst
idSubst = Subst (Map.empty)

instance Substitutable KLambda where
  apply subst@(Subst varmap) kl =
    case kl of
      Unary vn vnPos kt ->
        let subst' = Subst (Map.delete vn varmap)
        in  Unary vn vnPos (apply subst' kt)
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
  apply subst@(Subst varmap) (Fun vn klam pos) =
    let subst' = Subst (Map.delete vn varmap)
    in Fun vn (apply subst' klam) pos

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
         let fnames = map (\(Fun v _ _) -> v) fdefs
             subst' = Subst ( foldl (\m v -> Map.delete v m) varmap fnames)
             kt' = apply subst' kt
             fdefs' = map (apply subst') fdefs
         in LetFun fdefs' kt' p
      Halt v p -> Halt (vfwd v) p
      KontReturn v p -> KontReturn (vfwd v) p
      ApplyFun fn argn p -> ApplyFun (vfwd fn) (vfwd argn) p
      If v k1 k2 p -> If (vfwd v) (apply subst k1) (apply subst k2) p
      AssertElseError v k1 z p -> AssertElseError (vfwd v) (apply subst k1) (vfwd z) p
      Error x p -> Error (vfwd x) p
   where vfwd x = Map.findWithDefault x x varmap


type Census = Map VarName Integer

type CensusCollector = State Census 

class CensusCollectible a 
  where updateCensus :: a -> CensusCollector ()

incUse :: VarName -> CensusCollector ()
incUse x = modify $ Map.insertWith (+) x 1 

instance CensusCollectible VarName where
  updateCensus = incUse 

instance CensusCollectible a => CensusCollectible [a] where 
  updateCensus = mapM_ updateCensus

instance CensusCollectible SimpleTerm where
  updateCensus t = case t of
      Bin _ v1 v2 _ -> updateCensus [v1,v2]
      Un _ v _ -> updateCensus v
      ValSimpleTerm sv _ -> updateCensus sv
      Tuple vs _ -> updateCensus vs
      Record fs _ -> let (_,vs) = unzip fs in updateCensus vs
      WithRecord v fs _ -> updateCensus v >> (let (_,vs) = unzip fs in updateCensus vs )
      ProjField v _ _ -> updateCensus v
      ProjIdx v _ _ -> updateCensus v
      List vs _ -> updateCensus vs
      ListCons v vs _ -> updateCensus v >> updateCensus vs
      Base _ -> return ()
      Lib _ _ -> return ()

instance CensusCollectible KLambda where
  updateCensus kl = case kl of
      Unary _ _ kt -> updateCensus kt
      Nullary kt -> updateCensus kt 

instance CensusCollectible SVal where 
  updateCensus sv = case sv of 
    KAbs kl -> updateCensus kl 
    Lit _ -> return ()

instance CensusCollectible ContDef where 
  updateCensus (Cont _ kt) = updateCensus kt 

instance CensusCollectible FunDef where
  updateCensus (Fun _ kl _) = updateCensus kl 

instance CensusCollectible KTerm where
  updateCensus t = case t of
    LetSimple _ st kt _ -> updateCensus st >> updateCensus kt
    LetFun fs kt _ -> updateCensus fs >> updateCensus kt
    LetRet ct kt _ -> updateCensus ct >> updateCensus kt
    KontReturn x _ -> updateCensus x
    ApplyFun v u _ -> updateCensus [v,u]
    If v k1 k2 _ -> updateCensus v >> updateCensus [k1,k2]
    AssertElseError v k u _ -> updateCensus [v,u] >> updateCensus k
    Error v _ -> updateCensus v
    Halt v _ -> updateCensus v

  
getCensus :: KTerm -> Census 
getCensus k = execState (updateCensus k) Map.empty



---------------------------

data Term = St SimpleTerm | Unknown deriving (Eq,Show) 
type Env = Map VarName Term


class BindableDef a where 
  binddef::a -> Opt () 


bindenv :: VarName -> Term -> Opt ()
bindenv x t = 
 modify (\s -> s { __env_of_state = Map.insert x t (__env_of_state s) })

-- instance BindableDef FunDef where 
--   binddef (Fun v kl) = bindenv v (Fn kl)

instance BindableDef a => BindableDef [a] where 
  binddef = mapM_ binddef 

--------------------

type CSEMap = Map SimpleTerm VarName

data OptState = OptState {
      __env_of_state :: Env
    }

data OptReader = OptReader {
      __census_of_reader :: Census ,
      __rewrite_ret_of_reader :: Maybe ContDef ,
      __cse_map_of_reader :: CSEMap
    }    

type Opt = RWS OptReader () OptState
class Simplifiable a where 
  simpl :: a -> Opt a

instance Simplifiable a => Simplifiable [a] where 
  simpl = mapM simpl

instance Simplifiable FunDef where
  simpl (Fun arg kl pos) = simpl kl  >>= \kl' -> return $ Fun arg kl' pos

instance Simplifiable ContDef where 
  simpl (Cont v kt) = simpl kt >>= return . Cont v
    
instance Simplifiable KLambda where
  simpl (Unary v vPos k) = simpl k >>= return . Unary v vPos
  simpl (Nullary k) = simpl k >>= return . Nullary

look :: VarName -> Opt Term 
look x = do 
  m <- __env_of_state <$> get 
  return $ Map.findWithDefault Unknown
              -- (error $ "cannot find binding for name" ++ (show x)) 
              x m

censusInfo :: VarName -> Opt Integer
censusInfo x = do 
  census <- __census_of_reader <$> ask 
  return $ Map.findWithDefault 0 x census


fields x = do
    w <- look x
    case w of
      St (Record xs _) -> return xs
      St (WithRecord y ys _) ->  do
        xs <- fields y
        return $ xs ++ ys
      _ -> return []


isRecordTerm (St (Record _ _)) = True
isRecordTerm (St (WithRecord _ _ _)) = True
isRecordTerm _ = False

recordEquiv r1 r2 = do 
  f1 <- fields r1 
  f2 <- fields r2 
  let f1' = sort f1 
      f2' = sort f2 
  return (f1' == f2')



data ResOrSubst a = ResultSimplified a | ResultSubst VarName
simplifySimpleTerm :: SimpleTerm -> Opt (ResOrSubst SimpleTerm)
simplifySimpleTerm t =
  let _ret = return. ResultSimplified
      _subst = return . ResultSubst
      _nochange = _ret t
  in case t of
  Bin op oper1 oper2 p -> do
    u <- look oper1
    v <- look oper2
    case op of
      Basics.HasField -> case v of
           St (ValSimpleTerm  (Lit (C.LString s)) _) -> do
             fs <- fields oper1
             case lookup s fs of
               Just _ -> _ret $ __trueLit
               Nothing -> _nochange
           _ -> _nochange

      -- Basics.Eq | (isLit u && isLit v) ->
                    -- _ret $ lit $ C.LBool (litVal u == litVal v) -- slightly more general case
      Basics.Eq | u == v  && (u /= Unknown) -> _ret $ __trueLit
      Basics.Eq | (isLit u && isLit v) -> _ret $ lit $ C.LBool (C.litEq (litVal u) (litVal v))
      Basics.Eq | isRecordTerm u -> do
            e <- recordEquiv oper1 oper2
            if e then _ret $ __trueLit
                 else _nochange
      Basics.Neq | isLit u && isLit v -> _ret $ lit $ C.LBool (C.litNeq (litVal u) (litVal v))

      _ -> case (u, v) of
              (St (ValSimpleTerm (Lit (C.LNumeric (NumInt n1) _)) _),
               St (ValSimpleTerm (Lit (C.LNumeric (NumInt n2) _)) _)) ->
                    let ii f = _ret $ lit (C.LNumeric (NumInt (f n1 n2)) NoPos )
                        bb f = _ret $ lit (C.LBool (f n1 n2))
                      in case op of
                            Basics.Plus  -> ii (+)
                            Basics.Minus -> ii (-)
                            Basics.Mult  -> ii (*)
                            Basics.Le -> bb (<=)
                            Basics.Lt -> bb (<)
                            Basics.Ge -> bb (>=)
                            Basics.Gt -> bb (>)
                            _ -> _nochange


              _ -> _nochange
  Un op operand _ -> do
    v <- look operand
    -- TODO should write out all cases
    case (op,v) of
        (Basics.IsTuple, St (Tuple _ _))          -> _ret __trueLit
        (Basics.IsTuple, St (Record _ _))         -> _ret __falseLit
        (Basics.IsTuple, St (WithRecord _ _ _))   -> _ret __falseLit
        (Basics.IsTuple, St (List _ _))           -> _ret __falseLit
        (Basics.IsTuple, St (ListCons _ _ _))     -> _ret __falseLit
        (Basics.IsTuple, St (ValSimpleTerm _ _))  -> _ret __falseLit


        (Basics.IsRecord, St (Record _ _))        -> _ret __trueLit
        (Basics.IsRecord, St (WithRecord _ _ _))  -> _ret __trueLit
        (Basics.IsRecord, St (Tuple _ _))         -> _ret __falseLit
        (Basics.IsRecord, St (List _ _))          -> _ret __falseLit
        (Basics.IsRecord, St (ListCons _ _ _))    -> _ret __falseLit
        (Basics.IsRecord, St (ValSimpleTerm _ _)) -> _ret __falseLit


        (Basics.IsList, St (List _ _))          -> _ret __trueLit
        (Basics.IsList, St (ListCons _ _ _))    -> _ret __trueLit
        (Basics.IsList, St (Record _ _))        -> _ret __falseLit
        (Basics.IsList, St (WithRecord _ _ _))  -> _ret __falseLit
        (Basics.IsList, St (Tuple _ _))         -> _ret __falseLit
        (Basics.IsList, St (ValSimpleTerm _ _)) -> _ret __falseLit

        -- Not: constant folding
        (Basics.Not, St (ValSimpleTerm (Lit (C.LBool b)) _)) ->
            _ret $ lit (C.LBool (Prelude.not b))

        -- Not: double negation elimination (not (not x) -> x)
        (Basics.Not, St (Un Basics.Not innerVar _)) ->
            _subst innerVar

        -- Not: negated comparisons
        (Basics.Not, St (Bin Basics.Eq v1 v2 _))  -> _ret $ Bin Basics.Neq v1 v2 NoPos
        (Basics.Not, St (Bin Basics.Neq v1 v2 _)) -> _ret $ Bin Basics.Eq v1 v2 NoPos
        (Basics.Not, St (Bin Basics.Lt v1 v2 _))  -> _ret $ Bin Basics.Ge v1 v2 NoPos
        (Basics.Not, St (Bin Basics.Le v1 v2 _))  -> _ret $ Bin Basics.Gt v1 v2 NoPos
        (Basics.Not, St (Bin Basics.Gt v1 v2 _))  -> _ret $ Bin Basics.Le v1 v2 NoPos
        (Basics.Not, St (Bin Basics.Ge v1 v2 _))  -> _ret $ Bin Basics.Lt v1 v2 NoPos

        (Basics.TupleLength, St (Tuple xs _)) ->
            _ret $ lit (C.LNumeric (NumInt (fromIntegral (length xs))) NoPos)
        -- 2023-08 Revision: Added this case
        (Basics.ListLength, St (List xs _)) ->
            _ret $ lit (C.LNumeric (NumInt (fromIntegral (length xs))) NoPos)



        _ -> _nochange
  ProjField x s _ ->  do
    fs <- fields x
    case lookupLast s fs of
      Just y -> _subst y
      Nothing -> _nochange
  ProjIdx x idx _ -> do
    t' <- look x
    case t' of
      St (Tuple vs _) | fromIntegral (length vs) > idx ->
        _subst (vs !! fromIntegral idx)
      _ -> _nochange


  ValSimpleTerm (KAbs klam) p -> do
        klam' <- withResetRetState $ simpl klam
        _ret $ ValSimpleTerm (KAbs klam') p
{--
  List _ -> _nochange
  ListCons _ _ -> _nochange
  Base _ -> _nochange
  Lib _ _ -> _nochange
        --}
  _ -> _nochange

  where
    lit l = ValSimpleTerm (Lit l) NoPos
    isLit (St (ValSimpleTerm (Lit _) _)) = True
    isLit _ = False
    litVal (St (ValSimpleTerm (Lit (C.LNumeric n _)) _)) = (C.LNumeric n NoPos)
    litVal (St (ValSimpleTerm (Lit x) _)) = x
    litVal _ = error "incorrect application of litVal"
    __trueLit = lit (C.LBool True)
    __falseLit = lit (C.LBool False)


subst x v t = apply (Subst (Map.singleton  x v )) t

withResetRetState = local (\r -> r {__rewrite_ret_of_reader = Nothing}) 
withRetState st = local (\r -> r {__rewrite_ret_of_reader = Just st})

state_info :: Opt String 
state_info = do 
  r <- __rewrite_ret_of_reader <$> ask 
  return $ "ret\n"  ++ (show r)


failFree :: SimpleTerm -> Bool -- 2021-05-19; AA; hack
failFree st = case st of
  Bin op _ _ _ ->  op `elem` [Basics.Eq, Basics.Neq] -- Equality comparisons are safe (return boolean)
  Un _ _ _ -> False  -- Unary operations can fail (e.g., head on empty list, arithmetic on non-numbers)
  ValSimpleTerm _ _ -> True
  Tuple _ _ -> True
  Record _ _ -> True
  WithRecord _ _ _ -> True
  ProjField _ _ _ -> False  -- Field projection can fail if field doesn't exist
  ProjIdx _ _ _ -> False    -- Index projection can fail if index out of bounds
  List _ _ -> True
  ListCons _ _ _ -> False   -- List cons can fail if second arg is not a list
  Base _ -> False         -- Base function calls can have side effects or fail
  Lib _ _ -> False        -- Library function calls can have side effects or fail 

instance Simplifiable KTerm where
  simpl k = do
    --s <- state_info
    -- trace ("simpl-kterm\n" ++ (s) ++ "\n" ++ "~~~\n" ++(show k)++ ("\n----"))  $
    case k of
      LetSimple x st kt p -> do
        _cse <- __cse_map_of_reader <$> ask
        case Map.lookup st _cse of
          Just w -> simpl $ subst x w kt
          Nothing -> do
            x_uses <- censusInfo x
            case (x_uses, st) of
              (0, _) | failFree st  -> simpl kt
              (1, ValSimpleTerm (KAbs klambda@(Unary _ _ _ )) _)
                | isApplied x kt ->  do
                      bindenv x (St st)
                      simpl kt          -- remove the let-declaration
                                        -- expecting the substitution down the
                                        -- road in the application case
                                        -- 2021-05-17; AA
              _  -> do
                w <- simplifySimpleTerm st
                case w of
                  ResultSimplified st' -> do
                      bindenv x (St st')
                      kt' <- local (\r -> r { __cse_map_of_reader = Map.insert st' x _cse } ) (simpl kt)
                      return $ LetSimple x st' kt' p
                  ResultSubst w ->
                      simpl $ subst x w kt
      LetFun fdefs kt p -> do
        -- binddef fdefs
        fdefs' <- withResetRetState $ simpl fdefs
        kt' <- simpl kt
        return $ LetFun fdefs' kt' p
      LetRet ret kt p -> do
        ret_now <- __rewrite_ret_of_reader <$> ask
        ret' <- simpl ret
        if hasUniqueReturn kt
          then withRetState ret' (simpl kt)
          else do
            kt' <- withResetRetState (simpl kt)
            return $ LetRet ret' kt' p
      KontReturn x p -> do
        ret <- __rewrite_ret_of_reader <$> ask
        case ret of
          Nothing -> return $ KontReturn x p
          Just (Cont y kt) -> return $ subst y x kt
      ApplyFun x y p -> do
        x_uses <- censusInfo x
        case x_uses of
          1 -> do v <- look x
                  case v of
                    (St (ValSimpleTerm (KAbs (Unary arg _ body)) _)) -> do
                      simpl $ subst arg y body
                    _ -> return k
          _ -> return k
      If x k1 k2 p -> do
        v <- look x
        case v of
          St (ValSimpleTerm (Lit (C.LBool b)) _) ->
            simpl (if b then k1 else k2)
          -- If-branch swap: if (not y) k1 k2 -> if y k2 k1
          St (Un Basics.Not innerVar _) -> do
            k1' <- withResetRetState $ simpl k1
            k2' <- withResetRetState $ simpl k2
            return $ If innerVar k2' k1' p  -- swapped branches
          _ -> do
            k1' <- withResetRetState $ simpl k1
            k2' <- withResetRetState $ simpl k2
            return $ If x k1' k2' p
      AssertElseError x kt y pos -> do
        v <- look x
        case v of
          St (ValSimpleTerm (Lit (C.LBool b)) _)->
            simpl (if b then kt else (Error y pos))
          _ -> do
              k' <- simpl kt
              return $ AssertElseError x k' y pos
      Error _  _ -> return k
      Halt _ _ -> return k 



hasUniqueReturn :: KTerm -> Bool
hasUniqueReturn k =
  case k of
    KontReturn _ _            -> True
    LetSimple _ _ k' _        -> hasUniqueReturn k'
    LetFun _ k' _             -> hasUniqueReturn k'
    ApplyFun _ _ _            -> False
    If _ _ _ _                -> False
    AssertElseError _ k' _ _  -> hasUniqueReturn k'
    Halt _ _                  -> True
    Error _ _                 -> True
    LetRet (Cont _ k') _ _    -> hasUniqueReturn k'

isApplied :: VarName -> KTerm -> Bool
isApplied f k =
  case k of
    KontReturn _ _ -> False
    LetSimple _  _ k' _ -> isApplied f k'
    LetFun fdefs k' _ ->
       or $ (isApplied f k') :
            [ isApplied f k'' | Fun _ kl _ <- fdefs, let k'' = kTermOfLambda kl]
    ApplyFun g _ _ -> g == f
    If _ k1 k2 _ -> isApplied f k1 || isApplied f k2
    AssertElseError  _ k' _ _ -> isApplied f k'
    Halt _ _ -> False
    Error _ _ -> False
    LetRet (Cont _ k') k'' _ -> isApplied f k' || isApplied f k''
   where kTermOfLambda (Unary _ _ k') = k'
         kTermOfLambda (Nullary k') = k'
    

iter :: KTerm -> KTerm
iter kt = 
      let census = getCensus kt
          (kt', _, _) = runRWS (simpl kt) 
                          OptReader {
                             __census_of_reader = census,
                             __rewrite_ret_of_reader = Nothing,
                             __cse_map_of_reader = Map.empty 

                          }
                          OptState { __env_of_state = Map.empty
                          }
      in if kt == kt' then kt
                      else -- trace ((show kt) ++ ("\n------\n") ++ (show kt') ++ "\n========\n") 
                           iter kt' 

rewrite :: Prog -> Prog
rewrite (Prog atoms kterm) = 
 Prog atoms (iter kterm)