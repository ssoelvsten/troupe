{-# LANGUAGE TupleSections #-}
module RetDFCPS (transProg) where

import           Basics
import           Control.Monad.State.Lazy as State
import           qualified RetCPS as CPS
import           RetCPS
import qualified Core
import           TroupePositionInfo (Located(..), PosInf(..), GetPosInfo(..))

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
transFunDecl (Core.FunDecl fname (Core.Unary pat patPos le) pos) = do
--  k <- freshK
  e' <- transExplicit le
  return $ CPS.Fun (VN fname) (CPS.Unary (VN pat) patPos e') pos
transFunDecl (Core.FunDecl fname (Core.Nullary le) pos) = do
--  k <- freshK
  e' <- transExplicit le
  return $ CPS.Fun (VN fname) (CPS.Nullary e') pos

transProg :: Core.Prog -> CPS.Prog
transProg (Core.Prog imports atoms lt) =
  let pos = posInfo lt
  in Prog atoms $ evalState (trans lt (\z -> return $ Halt z pos)) 1


-- | Transform LFields in a context (non-explicit)
transFields :: PosInf -> ([(FieldName, CPS.VarName)] -> PosInf -> SimpleTerm) -> Core.LFields -> (CPS.VarName -> S CPS.KTerm) -> S CPS.KTerm
transFields pos k fields context =
  transRecord fields [] context
    where
      transRecord [] acc ctx = do
          v <- freshV
          e' <- ctx v
          return $ LetSimple v (k (reverse acc) pos) e' pos
      transRecord ((f, lt):rest) acc ctx =
        trans lt (\v -> transRecord rest ((f,v):acc) ctx)


-- | Transform LFields in explicit context
transFieldsExplicit :: PosInf -> ([(FieldName, CPS.VarName)] -> PosInf -> SimpleTerm) -> Core.LFields -> S CPS.KTerm
transFieldsExplicit pos k fields =
  iter fields []
    where iter [] acc = do
              v <- freshV
              return $ LetSimple v (k (reverse acc) pos) (KontReturn v pos) pos
          iter ((f,lt):rest) acc  =
              trans lt (\v -> iter rest ((f,v):acc))


-- | Transform a Located Core term in explicit context (adapter pattern)
-- Extract position from Located wrapper and embed in old-style CPS constructors
transExplicit :: Core.LTerm -> S CPS.KTerm
transExplicit (Loc pos (Core.Var (Core.RegVar x)))  = return $ KontReturn (VN x) pos

transExplicit (Loc pos (Core.Var (Core.BaseName baseName))) = do
  x  <- freshV
  return $ LetSimple x (Base baseName) (KontReturn x pos) pos

transExplicit (Loc pos (Core.Var (Core.LibVar lib v))) = do
  x <- freshV
  return $ LetSimple x (Lib lib v) (KontReturn x pos) pos

transExplicit (Loc _ (Core.Lit lit)) = do
  x <- freshV
  let pos = posInfo lit
  return $ LetSimple x (ValSimpleTerm (CPS.Lit lit) pos) (KontReturn x pos) pos

transExplicit (Loc pos (Core.Error lterm)) = do
  trans lterm (\v -> return $ Error v pos)

transExplicit (Loc pos (Core.App le1 le2)) = do
  trans le1 (\x1 ->
    trans le2 (\x2 ->
      return $ ApplyFun x1 x2 pos))

transExplicit (Loc pos (Core.Bin op le1 le2)) = do
  x <- freshV
  trans le1 (\x1 ->
    trans le2 (\x2 ->
      return $ LetSimple x (CPS.Bin op x1 x2 pos) (KontReturn x pos) pos))

transExplicit (Loc pos (Core.Un op le)) = do
  x <- freshV
  trans le (\x' ->
      return $ LetSimple x (CPS.Un op x' pos) (KontReturn x pos) pos)

transExplicit (Loc pos (Core.Abs (Core.Unary x xPos le))) = do
  f <- freshV
  e' <- transExplicit le
  return $ LetSimple f (ValSimpleTerm (KAbs (Unary (VN x) xPos e')) pos) (KontReturn f pos) pos

transExplicit (Loc pos (Core.Abs (Core.Nullary le))) = do
  f <- freshV
  e' <- transExplicit le
  return $ LetSimple f (ValSimpleTerm (KAbs (Nullary e')) pos) (KontReturn f pos) pos

transExplicit (Loc pos (Core.Let (Core.ValDecl v le1) le2))  = do
  e2' <- transExplicit le2
  e1' <- transExplicit le1
  return $ LetRet (Cont (VN v) e2') e1' pos

transExplicit (Loc pos (Core.Let (Core.FunDecs decs) le2))  = do
  decs' <- transFunDecs decs
  e2' <- transExplicit le2
  return $ LetFun decs' e2' pos

transExplicit (Loc pos (Core.If le0 le1 le2))  = do
  e1' <- transExplicit le1
  e2' <- transExplicit le2
  trans le0 (\z -> return $ If z e1' e2' pos)

-- 2018-09-28: AA; gotta double check this part of
-- the translation
transExplicit (Loc pos (Core.AssertElseError le0 le1 le2)) = do
  e1' <- transExplicit le1
  trans le0 (\v0 ->
    trans le2 (\v2 ->
      return $ AssertElseError v0 e1' v2 pos))


transExplicit (Loc pos (Core.Tuple lts))  =
  transTuple lts []
  where
    transTuple :: [Core.LTerm] -> [CPS.VarName] -> S KTerm
    transTuple [] acc  = do
      v <- freshV
      return $ LetSimple v (Tuple (reverse acc) pos) (KontReturn v pos) pos
    transTuple (lt:rest) acc  =
      trans lt (\v -> transTuple rest (v:acc) )

transExplicit (Loc pos (Core.Record fields)) =
    transFieldsExplicit pos Record fields

transExplicit (Loc pos (Core.WithRecord le fields)) =
  trans le (\x -> transFieldsExplicit pos (WithRecord x) fields)


transExplicit (Loc pos (Core.ProjField lt f))= do
  x <- freshV
  trans lt (\x' ->
    return $ LetSimple x (CPS.ProjField x' f pos) (KontReturn x pos) pos)

transExplicit (Loc pos (Core.ProjIdx lt idx)) = do
  x <- freshV
  trans lt (\x' ->
    return $ LetSimple x (CPS.ProjIdx x' idx pos) (KontReturn x pos) pos)

transExplicit (Loc pos (Core.List lts)) =
  transList lts []
  where
    transList [] acc  = do
      v <- freshV
      return $ LetSimple v (List (reverse acc) pos) (KontReturn v pos) pos
    transList (lt:rest) acc =
      trans lt (\v -> transList rest (v:acc))

transExplicit (Loc pos (Core.ListCons lh lt)) = do
  v <- freshV
  trans lh (\h' -> trans lt (\t' -> return $ LetSimple v (ListCons h' t' pos) (KontReturn v pos) pos))

transFunDef :: Core.Lambda -> S CPS.KLambda
transFunDef (Core.Unary x xPos le) = do
  e' <- transExplicit le
  return (CPS.Unary (VN x) xPos e')
transFunDef (Core.Nullary le) = do
  e' <- transExplicit le
  return (CPS.Nullary e')

-- | Transform a Located Core term with a continuation (adapter pattern)
-- Extract position from Located wrapper and embed in old-style CPS constructors
trans :: Core.LTerm -> (CPS.VarName -> S CPS.KTerm) -> S CPS.KTerm

trans (Loc _ (Core.Var (Core.RegVar x))) context = context (VN x)

trans (Loc pos (Core.Var (Core.BaseName baseName))) context = do
  x <- freshV
  kterm' <- context x
  return $ LetSimple x (Base baseName) kterm' pos


trans (Loc pos (Core.Var (Core.LibVar lib v))) context = do
  x <- freshV
  kterm' <- context x
  return $ LetSimple x (Lib lib v) kterm' pos


trans (Loc _ (Core.Lit lit)) context =
  do x <- freshV
     kterm' <- context x
     let pos = posInfo lit
     return $ LetSimple x (ValSimpleTerm (CPS.Lit lit) pos) kterm' pos

trans (Loc pos (Core.Error le)) context = do
  x  <- freshV
  kterm <- context x
  trans le (\z -> return $ LetRet (Cont x kterm) (Error z pos) pos)

trans (Loc pos (Core.App le1 le2)) context = do
  x  <- freshV
  kterm <- context x
  trans le1 (\z1 ->
    trans le2 (\z2 ->
      return $ LetRet (Cont x kterm) (ApplyFun z1 z2 pos) pos))

trans (Loc pos (Core.Bin op le1 le2)) context = do
  x <- freshV
  kterm <- context x
  trans le1 (\z1 ->
    trans le2 (\z2 ->
      return $ LetSimple x (CPS.Bin op z1 z2 pos) kterm pos))

trans (Loc pos (Core.Un op le)) context = do
  x <- freshV
  kterm <- context x
  trans le (\z -> return $ LetSimple x (CPS.Un op z pos) kterm pos)

trans (Loc pos (Core.Abs (Core.Unary x xPos le))) context = do
  f <- freshV
  kterm <- context f
  e' <- transExplicit le
  return $ LetSimple f (ValSimpleTerm (KAbs (Unary (VN x) xPos e')) pos) kterm pos

trans (Loc pos (Core.Abs (Core.Nullary le))) context = do
  f <- freshV
  kterm <- context f
  e' <- transExplicit le
  return $ LetSimple f (ValSimpleTerm (KAbs (Nullary e')) pos) kterm pos

trans (Loc pos (Core.Let (Core.ValDecl v le1) le2)) context = do
  e2' <- trans le2 context
  e1' <- transExplicit le1
  return $ LetRet (Cont (VN v) e2') e1' pos

trans (Loc pos (Core.Let (Core.FunDecs decs) le2)) context = do
  decs' <- transFunDecs decs
  e2' <- trans le2 context
  return $ LetFun decs' e2' pos

trans (Loc pos (Core.If le0 le1 le2)) context = do
  v <- freshV
  kterm <- context v
  e1' <- transExplicit le1
  e2' <- transExplicit le2
  trans le0 (\z -> return $ LetRet (Cont v kterm) (If z e1' e2' pos) pos)


trans (Loc pos (Core.AssertElseError le0 le1 le2)) context = do
  x <- freshV
  kterm <- context x
  e1' <- transExplicit le1
  trans le0 (\z ->
    trans le2 (\z2 ->
      return $ LetRet (Cont x kterm) (AssertElseError z e1' z2 pos) pos))



trans (Loc pos (Core.Tuple lts)) context =
  transTuple lts [] context
  where
    transTuple [] acc ctx = do
      v <- freshV
      e' <- ctx v
      return $ LetSimple v (Tuple (reverse acc) pos) e' pos
    transTuple (lt:rest) acc ctx =
      trans lt (\v -> transTuple rest (v:acc) ctx)

trans (Loc pos (Core.Record fields)) context = transFields pos Record fields context

trans (Loc pos (Core.WithRecord le fields)) context =
  trans le (\ rr -> transFields pos (WithRecord rr) fields context )


trans (Loc pos (Core.ProjField lt f)) context = do
  x <- freshV
  kterm <- context x
  trans lt (\z -> return $ LetSimple x (CPS.ProjField z f pos) kterm pos)

trans (Loc pos (Core.ProjIdx lt idx)) context = do
  x <- freshV
  kterm <- context x
  trans lt (\z -> return $ LetSimple x (CPS.ProjIdx z idx pos) kterm pos)

trans (Loc pos (Core.List lts)) context =
  transList lts [] context
  where
    transList [] acc ctx = do
      v <- freshV
      e' <- ctx v
      return $ LetSimple v (List (reverse acc) pos) e' pos
    transList (lt:rest) acc ctx =
      trans lt (\v -> transList rest (v:acc) ctx)

trans (Loc pos (Core.ListCons lh lt)) context = do
  v <- freshV
  e' <- context v
  trans lh (\h' -> trans lt (\t' -> return $ LetSimple v (ListCons h' t' pos) e' pos))


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
