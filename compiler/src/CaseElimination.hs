{-# LANGUAGE  FlexibleContexts  #-}
{-# LANGUAGE LambdaCase #-}
{-# OPTIONS_GHC -Wno-unrecognised-pragmas #-}
{-# HLINT ignore "Use camelCase" #-}
{-# HLINT ignore "Redundant bracket" #-}
module CaseElimination ( trans )
where

import Basics
import qualified Direct as S
import Direct (RecordPatternMode(..))
import DirectWOPats as T
import CompileMode
import TroupePositionInfo (Located(..), getLoc, PosInf(..), ErrorPosInf(..), GetPosInfo(..))

import Control.Monad.Reader
import Control.Monad.Except
import Control.Monad (foldM)
import Data.List (nub, (\\))
import Debug.Trace (trace)

type Trans = Except String

trans :: CompileMode -> S.Prog -> Trans T.Prog
trans compileMode (S.Prog imports atms tm) = do
  let tm' = case compileMode of
        CompileMode.Library -> tm
        _                   ->
          -- Create Located wrappers for generated code
          let authPat = Loc _srcRT (S.VarPattern "authority")
              authVar = Loc NoPos (S.Var "$$authorityarg")
          in Loc NoPos (S.Let [ S.ValDecl authPat authVar ] tm)
  atms' <- transAtoms atms
  tm'' <- transLTerm tm'
  return (T.Prog imports atms' tm'')

transAtoms :: S.Atoms -> Trans T.Atoms
transAtoms (S.Atoms atms) = return (T.Atoms atms)

transLit :: S.Lit -> T.Lit
transLit (S.LNumeric n pi) = T.LNumeric (transNumeric n) pi
  where
    transNumeric (S.NumInt i) = NumInt i
    transNumeric (S.NumFloat f) = NumFloat f
transLit (S.LString s) = T.LString s
transLit (S.LLabel s)  = T.LLabel s
transLit (S.LDCLabel dc)  = T.LDCLabel dc
transLit (S.LUnit)     = T.LUnit
transLit (S.LBool b)   = T.LBool b
transLit (S.LAtom a)   = T.LAtom a


-- | Unwrap LDeclPattern and get its position
unLPat :: S.LDeclPattern -> (S.DeclPattern, PosInf)
unLPat (Loc p pat) = (pat, p)

transLambda_aux :: S.Lambda -> ReaderT T.Term Trans Lambda
transLambda_aux (S.Lambda pats body) = do
  let args = map (("$arg" ++) . show) [1..(length pats)]
      -- Pair arg names with positions from the original patterns (extracted from Located)
      argsWithPos = zipWith (\a lp -> (a, getLoc lp)) args pats
      argPat = zip (map (\a -> Var a NoPos) args) pats
  body' <- lift (transLTerm body)
  result <- foldM compilePattern body' (reverse argPat)
  return (Lambda argsWithPos result)

transLambdaWithError :: S.Lambda -> T.Term -> Trans Lambda
transLambdaWithError lam errorTerm =
  runReaderT (transLambda_aux lam) errorTerm

transLambda :: S.Lambda -> Trans Lambda
transLambda lam =
  transLambdaWithError lam (Error (Lit (LString "pattern match failed")) (ErrorPos NoPos))


{-- 2019-01-31 desugaring handlers; AA

-- 2025-05-10: AA: See Section on Input Handlers in
-- Troupe 2.0 system and security model writeup
-- as a guide towards a rewrite

Given `hn pat1 | pat2 when e1 => e2`, we desugar it to

fn (input) => 
  case input of 
      (pat1, pat2) => if e1 then (0, fn _ => e2)
                            else (1, ())
      _ => HNPATFAIL (1, ())

.
Here, HNPATSUCC and HNPATFAIL are two runtime functions. The semantics
is that before the handler is called, the runtime sets the thread
flag to the "HANDLER MODE" that will prevent side effects (including 
picking messages from the mailbox and sending messages to other threads).
Calling PATSUCC will bring the thread back to normal mode. 


--}


_srcRT = RTGen "CaseElimination"

transHandler :: S.Handler -> Trans Lambda
transHandler (S.Handler pat1 mbpat2 guard body) = do
  let argInput  = "$input"
      -- Helper to create Located wrappers at RTGen position
      lp = Loc _srcRT  -- for patterns
      lt = Loc _srcRT  -- for terms
      pat2 = case mbpat2 of
              Just p2 -> p2
              Nothing -> lp S.Wildcard
      lambdaPats = [lp (S.VarPattern argInput)]
      callFailure = lt (S.Tuple [lt (S.Lit (S.LNumeric (S.NumInt 1) _srcRT)), lt (S.Lit S.LUnit)])
      body' = lt (S.Tuple [lt (S.Lit (S.LNumeric (S.NumInt 0) _srcRT)), lt (S.Abs (S.Lambda [lp S.Wildcard] body))])
      guardCheck = case guard of
         Nothing -> body'
         Just g -> lt (S.If g body' callFailure)
      lamBody = lt (S.Case (lt (S.Var argInput))
                           [(lp (S.TuplePattern [pat1, pat2]), guardCheck),
                            (lp S.Wildcard, callFailure)])
      lambda = S.Lambda lambdaPats lamBody
  transLambda lambda
  

-- 2018-09-28: AA: a bit of a hack: making sure that the last pattern is
-- compiled into an assertion instead of an ifthenelse
ifpat pos t1 t2 t3 =
  case t3 of
    Error t3' errPos -> AssertElseError t1 t2 t3' errPos  -- errPos is already ErrorPosInf
    _ -> If t1 t2 t3 pos
  
  
-- 2023-06-21: FW: an alternative would be to add a pseudo pattern at the end of each pattern list,
-- which includes the error message and always compiles to an error term.
-- | Compile pattern matching to conditionals and assertions.
-- succ: term corresponding to a successful match
-- v: the term to be assigned to the pattern
-- lpat: the Located pattern (we unwrap to get both pattern and position)
-- The Reader monad stores the error term.
compilePattern :: T.Term -> (T.Term, S.LDeclPattern) -> ReaderT T.Term Trans T.Term
compilePattern succ (v, Loc _ (S.AtPattern lp l))  = do
  fail <- ask
  let pos = posInfo v
  succ' <- compilePattern succ (v, lp)
  return $ ifpat pos (Bin Eq (Un LevelOf v pos) (Lit (LLabel l)) pos) succ' fail
compilePattern succ (v, Loc _ (S.VarPattern var)) = return $ Let [T.ValDecl var v] succ (posInfo v)
compilePattern succ (v, Loc _ (S.ValPattern lit)) = do
  fail <- ask
  let pos = posInfo v
  return $ ifpat pos (Bin Eq v (Lit (transLit lit)) pos) succ fail
compilePattern succ (v, Loc _ S.Wildcard) = return $ Let [T.ValDecl "$wildcard" v] succ (posInfo v)
compilePattern succ (v, Loc _ (S.TuplePattern pats)) = do
  fail <- ask
  let pos = posInfo v
  -- Accessors for the value to be assigned to the patterns.
  let accessors = map (\idx -> ProjIdx v idx pos) [0..(fromIntegral (length pats) - 1)]
  -- Compile the nested patterns, combining the resulting terms for the respective patterns so that the left-most is evaluated first.
  succ' <- foldM compilePattern succ (reverse (zip accessors pats))
  -- The expression for the tuple pattern checks whether the to-be-assigned value is a tuple with the correct length,
  -- and then executes the expression succ' which checks the nested patterns.
  return $ ifpat pos (Bin And (Un IsTuple v pos) (Bin Eq (Un TupleLength v pos) (Lit (LNumeric (NumInt (toInteger (length pats))) _srcRT)) pos) pos) succ' fail
-- TODO Generate more efficient code:
-- Decompose the list v according to the pattern with a DFS pass.
-- This would benefit from an "is empty" operation (to not having to use the RT-dispatched equals).
-- A potentially expensive length calculation is then unnecessary.
-- However, this is more complicated, as would need unique name generation, also for potentially nested list patterns.
compilePattern succ (v, Loc _ (S.ListPattern pats)) = do
  fail <- ask
  let pos = posInfo v
  -- Accessors for the value to be assigned to the patterns.
  let accessors = map (\t -> Un Head t pos) $ iterate (\t -> Un Tail t pos) v
  -- Compile the nested patterns, combining the resulting terms for the respective patterns so that the left-most is evaluated first.
  succ' <- foldM compilePattern succ (reverse (zip accessors pats)) -- pairs of pattern (the nested ones in the list) and term accessing the value at the corresponding index in the list term
  -- The expression for the list pattern checks whether the to-be-assigned value is a list with the correct length,
  -- and then executes the expression succ' which checks the nested patterns.
  return $ ifpat pos (Bin And (Un IsList v pos) (Bin Eq (Un ListLength v pos) (Lit (LNumeric (NumInt (toInteger (length pats))) _srcRT)) pos) pos) succ' fail
compilePattern succ (v, Loc _ (S.ConsPattern lp1 lp2)) = do
  fail <- ask
  let pos = posInfo v
  succ' <- compilePattern succ (Un Head v pos, lp1)
  succ'' <- compilePattern succ' (Un Tail v pos, lp2)
  -- TODO Avoid list length (potentially expensive). Implement similarly to the improved list pattern (see above).
  return $ ifpat pos (Bin And (Un IsList v pos) (Bin Gt (Un ListLength v pos) (Lit (LNumeric (NumInt 0) _srcRT)) pos) pos) succ'' fail
compilePattern succ (v, Loc _ (S.RecordPattern fieldPatterns mode)) = do
  fail <- ask
  let pos = posInfo v
  -- Check for duplicate field names
  let fieldNames = map fst fieldPatterns
  let duplicates = fieldNames \\ nub fieldNames
  if not (null duplicates)
    then lift $ throwError $ "Duplicate field names in record pattern: " ++ show duplicates
    else do
      succ' <- foldM compileField succ (reverse fieldPatterns)
      case mode of
        WildcardMatch ->
          -- Current behavior - just check it's a record and has the specified fields
          return $ ifpat pos (Un IsRecord v pos) succ' fail
        ExactMatch ->
          -- Check that the record has exactly the specified number of fields
          let expectedSize = length fieldPatterns
              sizeCheck = Bin Eq (Un RecordSize v pos) (Lit (LNumeric (NumInt (fromIntegral expectedSize)) _srcRT)) pos
              recordCheck = Bin And (Un IsRecord v pos) sizeCheck pos
          in return $ ifpat pos recordCheck succ' fail
    where ifHasField f k = do
              succ' <- k
              fail <- ask
              let f' = Lit (LString f)
                  pos = posInfo v
              return $ ifpat pos (Bin HasField v f' pos) succ' fail

          compileField succ (f, Just lp) = do
              let pos = posInfo v
              ifHasField f $ compilePattern succ (T.ProjField v f pos, lp)

          compileField succ (f, Nothing) = do
              let pos = posInfo v
              ifHasField f $ compilePattern succ (T.ProjField v f pos, Loc _srcRT (S.VarPattern f))
  


-- | Tranform a declaration, compiling patterns into terms.
-- When there are multiple patterns like in functions or a case expression,
-- they are folded into a nested term, with an error expression innermost (after the last check).
-- The error expression is therefore passed as state of a Reader monad.
transDecl :: S.Decl -> Term -> Trans Term
transDecl (S.ValDecl lpat lt) succ = do
  let temp = "$decltemp$"
      patPos = getLoc lpat
  t' <- transLTerm lt
  result <- runReaderT (compilePattern succ ((Var temp patPos), lpat)) (Error (Lit (LString "pattern match failure in let declaration")) (ErrorPos patPos))
  return $ Let [ValDecl temp t'] result patPos
transDecl (S.FunDecs fundecs) succ = do
  fundecs' <- mapM transLFunDecl fundecs
  return (Let [FunDecs fundecs'] succ _srcRT)
  where
    argLength ((S.Lambda args _):_) = length args
    argLength [] = 0
    -- Extract positions from the patterns in the first lambda (from Located wrappers)
    argPositions lams = case lams of
      (S.Lambda pats _):_ -> map getLoc pats
      [] -> []
    transLFunDecl (Loc pos (S.FunDecl f lams)) = do
      let lams' = map (transLambda_aux . (\(S.Lambda args e) -> S.Lambda [Loc _srcRT (S.TuplePattern args)] e)) lams
          names = map (((f ++ "_pat") ++) . show) [1..(length lams)]
          args =  map (((f ++ "_arg") ++) . show) [1..(argLength lams)]
          -- Pair arg names with positions from original patterns
          extractedPositions = argPositions lams
          argsWithPos = zipWith (\a p -> (a, p)) args (extractedPositions ++ repeat _srcRT)
          args' =  Tuple (map (\a -> Var a pos) args) pos
          errorMsg = Error (Lit (LString $ "pattern match failure in function " ++ f)) (ErrorPos pos)
      (fst, decls) <- foldr (\(n, l) acc -> do
            (fail, decls) <- acc
            lam <- runReaderT l fail
            return ( (App (Var n pos) [args'] pos)
                   , (ValDecl n (Abs lam pos)) : decls)
          ) (return (errorMsg, [])) (zip names lams')
      return (FunDecl f (Lambda argsWithPos (Let (reverse decls) fst pos)) pos)

-- | Transform a Located Term by extracting position and embedding it in old-style Term
transLTerm :: S.LTerm -> Trans Term
transLTerm (Loc pos term) = transTerm pos term

-- | Transform a Term given its position (from the Located wrapper)
transTerm :: PosInf -> S.Term -> Trans Term
transTerm _ (S.Lit lit) = return (T.Lit (transLit lit))
transTerm pos (S.Var v) = return (T.Var v pos)
transTerm pos (S.Abs l) = do
  l' <- transLambda l
  return (T.Abs l' pos)
transTerm pos (S.Hnd h) = do
  h' <- transHandler h
  return (T.Abs h' pos)
transTerm pos (S.App lt1 largs) = do
  t1' <- transLTerm lt1
  args' <- mapM transLTerm largs
  return (T.App t1' args' pos)
transTerm _ (S.Let decls lt) = do
  t' <- transLTerm lt
  foldr (\decl acc -> do
          acc' <- acc
          transDecl decl acc'
        ) (return t') decls
transTerm pos (S.Case lt cases) = do
  t' <- transLTerm lt
  cases' <- mapM (\(lpat, lsucc) -> do
                    succ' <- transLTerm lsucc
                    return (lpat, succ')
                  ) cases
  let e = foldr (\(lpat, succ') fail ->
            case runExcept (runReaderT (compilePattern succ' (Var "casevar" pos, lpat)) fail) of
              Right result -> result
              Left err -> error err
          ) (Error (Lit (LString "pattern match failure in case expression")) (ErrorPos pos)) cases'
  return (Let [ValDecl "casevar" t'] e pos)
transTerm pos (S.If lt1 lt2 lt3) = do
  t1' <- transLTerm lt1
  t2' <- transLTerm lt2
  t3' <- transLTerm lt3
  return (If t1' t2' t3' pos)
transTerm pos (S.Tuple ltms) = do
  tms' <- mapM transLTerm ltms
  return (T.Tuple tms' pos)
transTerm pos (S.Record fields) = do
  fields' <- transFields pos fields
  return (T.Record fields' pos)
transTerm pos (S.WithRecord le fields) = do
  e' <- transLTerm le
  fields' <- transFields pos fields
  return (T.WithRecord e' fields' pos)
transTerm pos (S.ProjField lt f) = do
  t' <- transLTerm lt
  return (T.ProjField t' f pos)
transTerm pos (S.ProjIdx lt idx) = do
  t' <- transLTerm lt
  return (T.ProjIdx t' idx pos)
transTerm pos (S.List ltms) = do
  tms' <- mapM transLTerm ltms
  return (T.List tms' pos)
transTerm pos (S.ListCons lt1 lt2) = do
  t1' <- transLTerm lt1
  t2' <- transLTerm lt2
  return (T.ListCons t1' t2' pos)
transTerm pos (S.Bin op lt1 lt2) = do
  t1' <- transLTerm lt1
  t2' <- transLTerm lt2
  return (Bin op t1' t2' pos)
transTerm pos (S.Un op lt) = do
  t' <- transLTerm lt
  return (Un op t' pos)
transTerm _ (S.Seq lts) =
    case reverse lts of
        [lt] -> transLTerm lt
        lbody:lts_rev -> do
          let decls = map (\lt -> S.ValDecl (Loc _srcRT S.Wildcard) lt) (reverse lts_rev)
          transLTerm (Loc NoPos (S.Let decls lbody))
        []  -> throwError "impossible case: sequence of empty terms"

transTerm _ (S.Error _) = throwError "impossible case: error"

transFields :: PosInf -> S.LFields -> Trans [(String, T.Term)]
transFields pos = mapM $ \case
  (f, Nothing) -> return (f, T.Var f pos)
  (f, Just lt) -> do
    t' <- transLTerm lt
    return (f, t')
