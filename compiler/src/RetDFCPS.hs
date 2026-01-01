{-# LANGUAGE TupleSections #-}
module RetDFCPS (transProg) where

import           Basics
import           Control.Monad.State.Lazy as State
import           qualified RetCPS as CPS
import           RetCPS
import qualified Core
import           TroupePositionInfo (PosInf(..), GetPosInfo(..))

type S = State Integer

{--

A variant of the CPS transformation based on A.Kennedy's 2007 paper
which in itself is inspired by Danvy & Filinski's work for
our RetCPS language

--}

transFunDecs :: [Core.FunDecl] -> S [CPS.FunDef]
transFunDecs decls = do
  mapM transFunDecl decls

transFunDecl :: Core.FunDecl -> S CPS.FunDef
transFunDecl (Core.FunDecl fname (Core.Unary pat e) pos) = do
--  k <- freshK
  e' <- transExplicit e
  return $ CPS.Fun (VN fname) (CPS.Unary (VN pat) e') pos
transFunDecl (Core.FunDecl fname (Core.Nullary e) pos) = do
--  k <- freshK
  e' <- transExplicit e
  return $ CPS.Fun (VN fname) (CPS.Nullary e') pos

transProg :: Core.Prog -> CPS.Prog
transProg (Core.Prog imports atoms t) =
  let pos = posInfo t
  in Prog atoms $ evalState (trans t (\z -> return $ Halt z pos)) 1


transFields pos k fields context =
  transRecord fields [] context
    where
      transRecord [] acc context = do
          v <- freshV
          e' <- context v
          return $ LetSimple v (k (reverse acc) pos) e' pos
      transRecord ((f, t):fields) acc context =
        trans t (\v -> transRecord fields ((f,v):acc) context)


transFieldsExplicit pos k fields =
  iter fields []
    where iter [] acc = do
              v <- freshV
              return $ LetSimple v (k (reverse acc) pos) (KontReturn v pos) pos
          iter ((f,t):fields) acc  =
              trans t (\v -> iter fields ((f,v):acc))


transExplicit :: Core.Term -> S CPS.KTerm
transExplicit (Core.Var (Core.RegVar x) pos)  = return $ KontReturn (VN x) pos

transExplicit (Core.Var (Core.BaseName baseName) pos) = do
  x  <- freshV
  return $ LetSimple x (Base baseName) (KontReturn x pos) pos

transExplicit (Core.Var (Core.LibVar lib v) pos) = do
  x <- freshV
  return $ LetSimple x (Lib lib v) (KontReturn x pos) pos

transExplicit (Core.Lit lit) = do
  x <- freshV
  let pos = posInfo lit
  return $ LetSimple x (ValSimpleTerm (CPS.Lit lit) pos) (KontReturn x pos) pos

transExplicit (Core.Error term p) = do
  trans term (\v -> return $ Error v p)

transExplicit (Core.App e1 e2 pos) = do
  trans e1 (\x1 ->
    trans e2 (\x2 ->
      return $ ApplyFun x1 x2 pos))

transExplicit (Core.Bin op e1 e2 pos) = do
  x <- freshV
  trans e1 (\x1 ->
    trans e2 (\x2 ->
      return $ LetSimple x (CPS.Bin op x1 x2 pos) (KontReturn x pos) pos))

transExplicit (Core.Un op e pos) = do
  x <- freshV
  trans e (\x' ->
      return $ LetSimple x (CPS.Un op x' pos) (KontReturn x pos) pos)

transExplicit (Core.Abs (Core.Unary x e) pos) = do
  f <- freshV
  e' <- transExplicit e
  return $ LetSimple f (ValSimpleTerm (KAbs (Unary (VN x) e')) pos) (KontReturn f pos) pos

transExplicit (Core.Abs (Core.Nullary e) pos) = do
  f <- freshV
  e' <- transExplicit e
  return $ LetSimple f (ValSimpleTerm (KAbs (Nullary e')) pos) (KontReturn f pos) pos

transExplicit (Core.Let (Core.ValDecl v e1) e2 pos)  = do
  e2' <- transExplicit e2
  e1' <- transExplicit e1
  return $ LetRet (Cont (VN v) e2') e1' pos

transExplicit (Core.Let (Core.FunDecs decs) e2 pos)  = do
  decs' <- transFunDecs decs
  e2' <- transExplicit e2
  return $ LetFun decs' e2' pos

transExplicit (Core.If e0 e1 e2 pos)  = do
  e1' <- transExplicit e1
  e2' <- transExplicit e2
  trans e0 (\z -> return $ If z e1' e2' pos)

-- 2018-09-28: AA; gotta double check this part of
-- the translation
transExplicit (Core.AssertElseError e0 e1 e2 p) = do
  e1' <- transExplicit e1
  trans e0 (\v0 ->
    trans e2 (\v2 ->
      return $ AssertElseError v0 e1' v2 p))


transExplicit (Core.Tuple ts pos)  =
  transTuple ts []
  where
    transTuple :: [Core.Term] -> [CPS.VarName] -> S KTerm
    transTuple [] acc  = do
      v <- freshV
      return $ LetSimple v (Tuple (reverse acc) pos) (KontReturn v pos) pos
    transTuple (t:ts) acc  =
      trans t (\v -> transTuple ts (v:acc) )

transExplicit (Core.Record fields pos) =
    transFieldsExplicit pos Record fields

transExplicit (Core.WithRecord e fields pos) =
  trans e (\x -> transFieldsExplicit pos (WithRecord x) fields)


transExplicit (Core.ProjField t f pos)= do
  x <- freshV
  trans t (\x' ->
    return $ LetSimple x (CPS.ProjField x' f pos) (KontReturn x pos) pos)

transExplicit (Core.ProjIdx t idx pos) = do
  x <- freshV
  trans t (\x' ->
    return $ LetSimple x (CPS.ProjIdx x' idx pos) (KontReturn x pos) pos)

transExplicit (Core.List ts pos) =
  transList ts []
  where
    transList [] acc  = do
      v <- freshV
      return $ LetSimple v (List (reverse acc) pos) (KontReturn v pos) pos
    transList (t:ts) acc =
      trans t (\v -> transList ts (v:acc))

transExplicit (Core.ListCons h t pos) = do
  v <- freshV
  trans h (\h' -> trans t (\t' -> return $ LetSimple v (ListCons h' t' pos) (KontReturn v pos) pos))

transFunDef :: Core.Lambda -> S CPS.KLambda
transFunDef (Core.Unary x e) = do
  e' <- transExplicit e
  return (CPS.Unary (VN x) e')
transFunDef (Core.Nullary e) = do
  e' <- transExplicit e
  return (CPS.Nullary e')

trans :: Core.Term -> (CPS.VarName -> S CPS.KTerm) -> S CPS.KTerm


trans (Core.Var (Core.RegVar x) _) context = context (VN x)

trans (Core.Var (Core.BaseName baseName) pos) context = do
  x <- freshV
  kterm' <- context x
  return $ LetSimple x (Base baseName) kterm' pos


trans (Core.Var (Core.LibVar lib v) pos) context = do
  x <- freshV
  kterm' <- context x
  return $ LetSimple x (Lib lib v) kterm' pos


trans (Core.Lit i) context =
  do x <- freshV
     kterm' <- context x
     let pos = posInfo i
     return $ LetSimple x (ValSimpleTerm (CPS.Lit i) pos) kterm' pos

trans (Core.Error e p) context = do
  x  <- freshV
  kterm <- context x
  trans e (\z -> return $ LetRet (Cont x kterm) (Error z p) p)

trans (Core.App e1 e2 pos) context = do
  x  <- freshV
  kterm <- context x
  trans e1 (\z1 ->
    trans e2 (\z2 ->
      return $ LetRet (Cont x kterm) (ApplyFun z1 z2 pos) pos))

trans (Core.Bin op e1 e2 pos) context = do
  x <- freshV
  kterm <- context x
  trans e1 (\z1 ->
    trans e2 (\z2 ->
      return $ LetSimple x (CPS.Bin op z1 z2 pos) kterm pos))

trans (Core.Un op e pos) context = do
  x <- freshV
  kterm <- context x
  trans e (\z -> return $ LetSimple x (CPS.Un op z pos) kterm pos)

trans (Core.Abs (Core.Unary x e) pos) context = do
  f <- freshV
  kterm <- context f
  e' <- transExplicit e
  return $ LetSimple f (ValSimpleTerm (KAbs (Unary (VN x) e')) pos) kterm pos

trans (Core.Abs (Core.Nullary e) pos) context = do
  f <- freshV
  kterm <- context f
  e' <- transExplicit e
  return $ LetSimple f (ValSimpleTerm (KAbs (Nullary e')) pos) kterm pos

trans (Core.Let (Core.ValDecl v e1) e2 pos) context = do
  e2' <- trans e2 context
  e1' <- transExplicit e1
  return $ LetRet (Cont (VN v) e2') e1' pos

trans (Core.Let (Core.FunDecs decs) e2 pos) context = do
  decs' <- transFunDecs decs
  e2' <- trans e2 context
  return $ LetFun decs' e2' pos

trans (Core.If e0 e1 e2 pos) context = do
  v <- freshV
  kterm <- context v
  e1' <- transExplicit e1
  e2' <- transExplicit e2
  trans e0 (\z -> return $ LetRet (Cont v kterm) (If z e1' e2' pos) pos)


trans (Core.AssertElseError e0 e1 e2 p) context = do
  x <- freshV
  kterm <- context x
  e1' <- transExplicit e1
  trans e0 (\z ->
    trans e2 (\z2 ->
      return $ LetRet (Cont x kterm) (AssertElseError z e1' z2 p) p))



trans (Core.Tuple ts pos) context =
  transTuple ts [] context
  where
    transTuple [] acc context = do
      v <- freshV
      e' <- context v
      return $ LetSimple v (Tuple (reverse acc) pos) e' pos
    transTuple (t:ts) acc context =
      trans t (\v -> transTuple ts (v:acc) context)

trans (Core.Record fields pos) context = transFields pos Record fields context

trans (Core.WithRecord e fields pos) context =
  trans e (\ rr -> transFields pos (WithRecord rr) fields context )


trans (Core.ProjField t f pos) context = do
  x <- freshV
  kterm <- context x
  trans t (\z -> return $ LetSimple x (CPS.ProjField z f pos) kterm pos)

trans (Core.ProjIdx t idx pos) context = do
  x <- freshV
  kterm <- context x
  trans t (\z -> return $ LetSimple x (CPS.ProjIdx z idx pos) kterm pos)

trans (Core.List ts pos) context =
  transList ts [] context
  where
    transList [] acc context = do
      v <- freshV
      e' <- context v
      return $ LetSimple v (List (reverse acc) pos) e' pos
    transList (t:ts) acc context =
      trans t (\v -> transList ts (v:acc) context)

trans (Core.ListCons h t pos) context = do
  v <- freshV
  e' <- context v
  trans h (\h' -> trans t (\t' -> return $ LetSimple v (ListCons h' t' pos) e' pos))


freshSymbol :: S String
freshSymbol = do
  n <- State.get
  put (n + 1)
  return $ ("gensym" ++ show n)

freshV :: S CPS.VarName
freshV = do
      s <- freshSymbol
      return $ VN s

-- freshK :: S KontName
-- freshK = do
--        s <- freshSymbol
--        return $ K s
