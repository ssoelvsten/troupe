{-# LANGUAGE FlexibleContexts #-}
{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DefaultSignatures #-}


module ClosureConv where 

import qualified Basics
import RetCPS(VarName(..))
import qualified RetCPS as CPS
import qualified Core as C
import Control.Monad.RWS
import Data.Map.Lazy(Map)
import qualified Data.Map.Lazy as Map
import Data.Serialize(Serialize)
import GHC.Generics
import Control.Monad.State
import Control.Monad.Writer
import Control.Monad.Reader
import Data.List

import           Control.Monad.Except
import IR as CCIR

import Control.Monad.Identity

data VarLevel = VarNested Integer
                deriving (Eq, Ord, Show)


type FreshCounter = Integer
type NestingLevel = Integer

------------------------------------------------------------
-- Type declarations
------------------------------------------------------------

------------------------------------------------------------
-- The main translation takes place in RWS monad

type CC = RWS
            CCEnv                         -- reader: the translation environment
            (FunDefs, Frees, ConstTracking)      -- writer: hoisted funs and free variables 
            FreshCounter                  -- state:  the counter for fresh name generation


type CCEnv   = (C.Atoms, NestingLevel, Map VarName VarLevel, Maybe VarName)
type Frees   = [(VarName, NestingLevel)]
type FunDefs = [CCIR.FunDef]
type ConstEntry = (VarName, C.Lit)
type ConstTracking = [(ConstEntry, NestingLevel)]


------------------------------------------------------------
-- Auxiliary functions
------------------------------------------------------------
consBB:: CCIR.IRInst -> CCIR.IRBBTree -> CCIR.IRBBTree
consBB i (BB insts t) = BB (i:insts) t

insVar :: VarName -> CCEnv -> CCEnv
insVar vn (atms, lev, vmap, fname) =
    ( atms
    , lev
    , Map.insert vn (VarNested lev) vmap
    , fname
    )

insVars :: [VarName] -> CCEnv -> CCEnv
insVars vars ccenv =
    foldl (flip insVar) ccenv vars


askLev = do
  (_, lev, _, _) <- ask
  return lev


incLev fname (atms, lev, vmap, _) =
    (atms, lev + 1, vmap, (Just fname))


-- this helper function looks up the variable name 
-- in the enviroment and checks if it should be declared as free
-- or local

transVar :: VarName -> CC VarAccess
transVar v@(VN vname) = do 
  (C.Atoms atms, lev, vmap, maybe_fname) <- ask
  case maybe_fname of 
    Just fname | fname == v  -> return $ VarFunSelfRef
    _ -> 
      case Map.lookup v vmap of 
        Just (VarNested lev') -> 
          if lev' < lev 
          then do 
            tell $ ([], [(v, lev')], []) -- collecting info about free vars 
            return $ VarEnv v 
          else 
            return $ VarLocal v 
        Nothing -> 
          if vname `elem` atms
            then return $ VarLocal v 
            else error $ "undeclared variable: " ++ (show v)


transVars = mapM transVar         

isDeclaredEarlierThan lev (_, l)  = l < lev

transFunDec imps reqs f@(VN fname) (CPS.Unary var kt) = do   
  lev <- askLev
  let filt = isDeclaredEarlierThan lev
  (bb, (_, frees, consts_wo_levs)) <- 
      censor (\(a,b,c ) -> (a, filter filt b, filter (\(_, l) -> l == lev ) c))
     $ listen $ local ((insVar var) . (incLev f)) $ cpsToIR imps reqs kt
  let consts = (fst.unzip) consts_wo_levs
  tell ([FunDef (HFN fname) var imps reqs consts bb], [], [])
  return (nub frees)

transFunDec _ _ (VN _) (CPS.Nullary _) = error "not implemented"

-- state accessors

incState :: CC Integer
incState = do
  x <- get
  put (x + 1)
  return x


mkEnvBindings fv = do
  lev <- askLev
  let (freeVars', boundVars) = Data.List.partition (\(_, l) -> l <= lev - 1 ) fv
  let envVars = (map (\(v,_) -> (v, VarLocal v)) boundVars)
                      ++ (map (\(v,_) -> (v, VarEnv v)) freeVars')
  return envVars

------------------------------------------------------------
-- Main translation
------------------------------------------------------------

transFields fields = do 
          let (ff, vv) = unzip fields 
          lst' <- transVars vv 
          return $ zip ff lst'

cpsToIR :: Modules -> Modules -> CPS.KTerm -> CC CCIR.IRBBTree
cpsToIR imps reqs (CPS.LetSimple vname@(VN ident) st kt) = do 
    i <-
      let _assign arg = return $ Just $ CCIR.Assign vname arg in
      case st of 
        CPS.Base base -> _assign  $ Base base
        CPS.ImpBase mod -> _assign (CCIR.ImpBase mod)
        CPS.ReqBase mod -> _assign (CCIR.ReqBase mod)
        CPS.Bin binop v1 v2 -> do
          v1' <- transVar v1 
          v2' <- transVar v2
          _assign (Bin binop v1' v2')
        CPS.Un unop v -> do 
          v' <- transVar v
          _assign (Un unop v')
        CPS.Tuple lst -> do 
          lst' <- transVars lst 
          _assign (Tuple lst')
        CPS.Record fields -> do
          fields' <- transFields fields
          _assign (Record fields')
        CPS.WithRecord x fields -> do
          x' <- transVar x 
          fields' <- transFields fields
          _assign $ WithRecord x' fields'
        CPS.ProjField x f -> do
          x' <- transVar x 
          _assign (ProjField x' f)
        CPS.ProjIdx x idx -> do
          x' <- transVar x 
          _assign (ProjIdx x' idx)
        CPS.List lst -> do 
          lst' <- transVars lst 
          _assign (List lst')
        CPS.ListCons v1 v2 -> do 
          v1' <- transVar v1 
          v2' <- transVar v2 
          _assign (ListCons v1' v2')
        CPS.ValSimpleTerm (CPS.Lit lit) -> do lev <- askLev  
                                              tell ([],[],[((vname, lit), lev)])
                                              return Nothing 
        CPS.ValSimpleTerm (CPS.KAbs klam) -> do 
          freeVars <- transFunDec imps reqs vname klam          
          envBindings <- mkEnvBindings freeVars
          return $ Just $ CCIR.MkFunClosures envBindings [(vname, HFN ident)]          
        
    t <- local (insVar vname) (cpsToIR imps reqs kt)   
    return $ case i of 
      Just i' -> i' `consBB` t
      Nothing -> t 

cpsToIR imps reqs (CPS.LetRet (CPS.Cont arg kt') kt) = do
    t  <- cpsToIR imps reqs kt
    t' <- local (insVar arg) (cpsToIR imps reqs kt')
    return $ CCIR.BB [] $ StackExpand arg t t'
cpsToIR  imps reqs (CPS.LetFun fdefs kt) = do 
    let vnames_orig = map (\(CPS.Fun fname _) -> fname) fdefs
    let localExt = local (insVars vnames_orig)
    t <- localExt (cpsToIR imps reqs kt) -- translate the body

    frees <- mapM (\(CPS.Fun fname klam) -> 
                        localExt (transFunDec imps reqs fname klam)) 
                fdefs

    let freeVars = (nub.concat) frees 
    lev <- askLev
    let vnames_orig' = map (\x -> (x, lev)) vnames_orig
    envBindings <- mkEnvBindings (freeVars \\ vnames_orig')
    let fnBindings = map (\x@(VN i) -> (x, HFN i)) vnames_orig
    return $ (CCIR.MkFunClosures envBindings fnBindings) `consBB` t

-- Special Halt continuation, for exiting program
cpsToIR _ _ (CPS.Halt v) = do 
    v' <- transVar v
    return $ CCIR.BB [] $ CCIR.Ret v'

cpsToIR _ _ (CPS.KontReturn v) = do 
  v' <- transVar v 
  return $ CCIR.BB [] $ CCIR.Ret v'

cpsToIR _ _ (CPS.ApplyFun fname v) = do 
  fname' <- transVar fname 
  v'     <- transVar v 
  return $ CCIR.BB [] $ CCIR.TailCall fname' v'

cpsToIR imps reqs (CPS.If v kt1 kt2) = do 
  v' <- transVar v 
  bb1 <- cpsToIR imps reqs kt1 
  bb2 <- cpsToIR imps reqs kt2 
  return $ CCIR.BB [] $ CCIR.If v' bb1 bb2

cpsToIR imps reqs (CPS.AssertElseError v kt1 z p) = do 
  v' <- transVar v 
  z' <- transVar z 
  bb <- cpsToIR imps reqs kt1 
  return $ CCIR.BB [] $ CCIR.AssertElseError v' bb z' p

cpsToIR _ _ (CPS.Error v p) = do 
  v' <- transVar v 
  return $ CCIR.BB [] $ CCIR.Error v' p
  



------------------------------------------------------------
-- Top-level function
------------------------------------------------------------

closureConvert :: CPS.Prog -> Except String CCIR.IRProgram
closureConvert (CPS.Prog (C.Modules imps) (C.Modules reqs) (C.Atoms atms) t) =
  let atms' = C.Atoms atms
      initEnv = ( atms'
                , 0 -- initial nesting counter
                , Map.empty
                , Nothing -- top level code has no function name 
                )
      initState = 0
      (bb, (fdefs, _, consts_wo_levs)) = evalRWS (cpsToIR imps reqs t) initEnv initState
      argName  = "$$authorityarg"
      topLevel = "main"

      -- obs that our 'main' may have two names depending on the compilation mode; 2018-07-02; AA
      consts = (fst.unzip) consts_wo_levs
      main = FunDef (HFN topLevel) (VN argName) imps reqs consts bb

      irProg = CCIR.IRProgram (C.Atoms atms) $ fdefs++[main]
    in do CCIR.wfIRProg irProg 
          return irProg
    -- then irProg
    --                       else error "the generated IR is not well-formed"

               
  
  
