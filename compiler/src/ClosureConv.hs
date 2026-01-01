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
import CompileMode

import           Control.Monad.Except
import IR as CCIR

import Control.Monad.Identity
import TroupePositionInfo (PosInf(..), GetPosInfo(..))

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


type CCEnv   = (CompileMode, C.Atoms, NestingLevel, Map VarName VarLevel, Maybe VarName)
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
insVar vn (compileMode, atms, lev, vmap, fname) =
    ( compileMode
    , atms
    , lev
    , Map.insert vn (VarNested lev) vmap
    , fname
    )

insVars :: [VarName] -> CCEnv -> CCEnv
insVars vars ccenv =
    foldl (flip insVar) ccenv vars


askLev = do
  (_, _, lev, _, _) <- ask
  return lev


incLev fname (compileMode, atms, lev, vmap, _) =
    (compileMode, atms, lev + 1, vmap, (Just fname))


-- this helper function looks up the variable name 
-- in the enviroment and checks if it should be declared as free
-- or local

transVar :: VarName -> CC VarAccess
transVar v@(VN vname) = do 
  (_, C.Atoms atms, lev, vmap, maybe_fname) <- ask
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

transFunDec f@(VN fname) (CPS.Unary var kt) = do   
  lev <- askLev
  let filt = isDeclaredEarlierThan lev
  (bb, (_, frees, consts_wo_levs)) <- 
      censor (\(a,b,c ) -> (a, filter filt b, filter (\(_, l) -> l == lev ) c))
     $ listen 
        $ local ((insVar var) . (incLev f))
           $ cpsToIR kt
  let consts = (fst.unzip) consts_wo_levs
  tell ([FunDef (HFN fname) var consts bb], [], [])
  return (nub frees)

transFunDec (VN _) (CPS.Nullary _) = error "not implemented"

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

cpsToIR :: CPS.KTerm -> CC CCIR.IRBBTree
cpsToIR (CPS.LetSimple vname@(VN ident) st kt pos) = do
    i <-
      let _assign arg = return $ Just $ CCIR.Assign vname arg pos in
      case st of
        CPS.Base base -> _assign  $ Base base
        CPS.Lib lib base -> _assign (Lib lib base)
        CPS.Bin binop v1 v2 stPos -> do
          v1' <- transVar v1
          v2' <- transVar v2
          return $ Just $ CCIR.Assign vname (Bin binop v1' v2') stPos
        CPS.Un unop v stPos -> do
          v' <- transVar v
          return $ Just $ CCIR.Assign vname (Un unop v') stPos
        CPS.Tuple lst stPos -> do
          lst' <- transVars lst
          return $ Just $ CCIR.Assign vname (Tuple lst') stPos
        CPS.Record fields stPos -> do
          fields' <- transFields fields
          return $ Just $ CCIR.Assign vname (Record fields') stPos
        CPS.WithRecord x fields stPos -> do
          x' <- transVar x
          fields' <- transFields fields
          return $ Just $ CCIR.Assign vname (WithRecord x' fields') stPos
        CPS.ProjField x f stPos -> do
          x' <- transVar x
          return $ Just $ CCIR.Assign vname (ProjField x' f) stPos
        CPS.ProjIdx x idx stPos -> do
          x' <- transVar x
          return $ Just $ CCIR.Assign vname (ProjIdx x' idx) stPos
        CPS.List lst stPos -> do
          lst' <- transVars lst
          return $ Just $ CCIR.Assign vname (List lst') stPos
        CPS.ListCons v1 v2 stPos -> do
          v1' <- transVar v1
          v2' <- transVar v2
          return $ Just $ CCIR.Assign vname (ListCons v1' v2') stPos
        CPS.ValSimpleTerm (CPS.Lit lit) _ -> do lev <- askLev
                                                tell ([],[],[((vname, lit), lev)])
                                                return Nothing
        CPS.ValSimpleTerm (CPS.KAbs klam) stPos -> do
          freeVars <- transFunDec vname klam
          envBindings <- mkEnvBindings freeVars
          return $ Just $ CCIR.MkFunClosures envBindings [(vname, HFN ident)] stPos

    t <- local (insVar vname) (cpsToIR kt)
    return $ case i of
      Just i' -> i' `consBB` t
      Nothing -> t

cpsToIR (CPS.LetRet (CPS.Cont arg kt') kt pos) = do
    t  <- cpsToIR kt
    t' <- local (insVar arg) (cpsToIR kt')
    return $ CCIR.BB [] $ StackExpand arg t t' pos
cpsToIR (CPS.LetFun fdefs kt pos) = do
    let vnames_orig = map (\(CPS.Fun fname _) -> fname) fdefs
    let localExt = local (insVars vnames_orig)
    t <- localExt (cpsToIR kt) -- translate the body

    frees <- mapM (\(CPS.Fun fname klam) ->
                        localExt (transFunDec fname klam))
                fdefs

    let freeVars = (nub.concat) frees
    lev <- askLev
    let vnames_orig' = map (\x -> (x, lev)) vnames_orig
    envBindings <- mkEnvBindings (freeVars \\ vnames_orig')
    let fnBindings = map (\x@(VN i) -> (x, HFN i)) vnames_orig
    return $ (CCIR.MkFunClosures envBindings fnBindings pos) `consBB` t

-- Special Halt continuation, for exiting program
cpsToIR (CPS.Halt v pos) = do
    v' <- transVar v
    (compileMode,_ , _ , _, _ ) <- ask
    let constructor =
          case compileMode of
              -- Compiling library, then generate export instruction
              CompileMode.Library -> \x -> CCIR.LibExport x pos
              -- Otherwise, keep it as a simple return
              _                   -> \x -> CCIR.Ret x pos

    return $ CCIR.BB [] $ constructor v'

cpsToIR (CPS.KontReturn v pos) = do
  v' <- transVar v
  return $ CCIR.BB [] $ CCIR.Ret v' pos

cpsToIR (CPS.ApplyFun fname v pos) = do
  fname' <- transVar fname
  v'     <- transVar v
  return $ CCIR.BB [] $ CCIR.TailCall fname' v' pos

cpsToIR (CPS.If v kt1 kt2 pos) = do
  v' <- transVar v
  bb1 <- cpsToIR kt1
  bb2 <- cpsToIR kt2
  return $ CCIR.BB [] $ CCIR.If v' bb1 bb2 pos

cpsToIR (CPS.AssertElseError v kt1 z p) = do
  v' <- transVar v
  z' <- transVar z
  bb <- cpsToIR kt1
  return $ CCIR.BB [] $ CCIR.AssertElseError v' bb z' p

cpsToIR (CPS.Error v p) = do
  v' <- transVar v
  return $ CCIR.BB [] $ CCIR.Error v' p
  



------------------------------------------------------------
-- Top-level function
------------------------------------------------------------

closureConvert :: CompileMode -> CPS.Prog -> Except String CCIR.IRProgram
closureConvert compileMode (CPS.Prog (C.Atoms atms) t) =
  let atms' = C.Atoms atms
      initEnv = ( compileMode
                , atms'
                , 0 -- initial nesting counter
                , Map.empty
                , Nothing -- top level code has no function name 
                )
      initState = 0
      (bb, (fdefs, _, consts_wo_levs)) = evalRWS (cpsToIR t) initEnv initState
      (argumentName, toplevel) =
         case compileMode of
           -- Top level function of a library is named 'export'
           CompileMode.Library     -> ("$$dummy", "export")
           -- Passing authority through the argument to main
           _                       -> ("$$authorityarg", "main")


      -- obs that our 'main' may have two names depending on the compilation mode; 2018-07-02; AA
      consts = (fst.unzip) consts_wo_levs
      main = FunDef (HFN toplevel) (VN argumentName) consts bb

      irProg = CCIR.IRProgram (C.Atoms atms) $ fdefs++[main]
    in do CCIR.wfIRProg irProg 
          return irProg
    -- then irProg
    --                       else error "the generated IR is not well-formed"

               
  
  
