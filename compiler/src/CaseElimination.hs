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
import TroupePositionInfo

import Control.Monad.Reader
import Control.Monad.Except
import Control.Monad (foldM)
import Data.List (nub, (\\))

type Trans = Except String

trans :: CompileMode -> S.Prog -> Trans T.Prog
trans compileMode (S.Prog imports atms tm) = do
  let tm' = case compileMode of
        CompileMode.Library -> tm
        _                   ->
          S.Let [ S.ValDecl (S.VarPattern "authority") (S.Var "$$authorityarg") _srcRT ]
                tm
  atms' <- transAtoms atms
  tm'' <- transTerm tm'
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


transLambda_aux :: S.Lambda -> ReaderT T.Term Trans Lambda
transLambda_aux (S.Lambda pats t) = do
  let args = map (("$arg" ++) . show) [1..(length pats)]
      argPat = zip (map (\a -> Var a NoPos) args) pats
  t' <- lift (transTerm t)
  result <- foldM compilePattern t' (reverse argPat)
  return (Lambda args result)

transLambdaWithError :: S.Lambda -> T.Term -> Trans Lambda
transLambdaWithError lam errorTerm = 
  runReaderT (transLambda_aux lam) errorTerm

transLambda :: S.Lambda -> Trans Lambda
transLambda lam =
  transLambdaWithError lam (Error (Lit (LString "pattern match failed")) NoPos)


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
      pat2 = case mbpat2 of
              Just pat2 -> pat2
              Nothing   -> S.Wildcard      
      lambdaPats = [S.VarPattern argInput] 
      callFailure = S.Tuple [S.Lit (S.LNumeric (S.NumInt 1) _srcRT), S.Lit S.LUnit ]
      body' =  S.Tuple[ S.Lit (S.LNumeric (S.NumInt 0) _srcRT), S.Abs ( S.Lambda [S.Wildcard] body )  ]
      guardCheck = case guard of
         Nothing -> body'
         Just g -> S.If g body' callFailure
      lamBody = S.Case (S.Var argInput) [( S.TuplePattern [pat1, pat2], guardCheck), (S.Wildcard, callFailure)] _srcRT
      lambda = S.Lambda lambdaPats lamBody
  transLambda lambda
  

-- 2018-09-28: AA: a bit of a hack: making sure that the last pattern is
-- compiled into an assertion instead of an ifthenelse
ifpat t1 t2 t3 =
  case t3 of
    Error t3' pos -> AssertElseError t1 t2 t3' pos
    _ -> If t1 t2 t3 NoPos
  
  
-- 2023-06-21: FW: an alternative would be to add a pseudo pattern at the end of each pattern list,
-- which includes the error message and always compiles to an error term.
-- | Compile pattern matching to conditionals and assertions.
-- succ: term corresponding to a successful match
-- v: the term to be assigned to the pattern
-- The Reader monad stores the error term.
compilePattern :: T.Term -> (T.Term, S.DeclPattern) -> ReaderT T.Term Trans T.Term
compilePattern succ (v, (S.AtPattern p l))  = do
  fail <- ask
  succ' <- compilePattern succ (v, p)
  return $ ifpat (Bin Eq (Un LevelOf v NoPos) (Lit (LLabel l)) NoPos) succ' fail
compilePattern succ (v, (S.VarPattern var)) = return $ Let [T.ValDecl var v] succ NoPos
compilePattern succ (v, (S.ValPattern lit)) = do
  fail <- ask
  return $ ifpat (Bin Eq v (Lit (transLit lit)) NoPos) succ fail
compilePattern succ (v, S.Wildcard) = return $ Let [T.ValDecl "$wildcard" v] succ NoPos
compilePattern succ (v, S.TuplePattern pats) = do
  fail <- ask
  -- Accessors for the value to be assigned to the patterns.
  let accessors = map (\idx -> ProjIdx v idx NoPos) [0..(fromIntegral (length pats) - 1)]
  -- Compile the nested patterns, combining the resulting terms for the respective patterns so that the left-most is evaluated first.
  succ' <- foldM compilePattern succ (reverse (zip accessors pats))
  -- The expression for the tuple pattern checks whether the to-be-assigned value is a tuple with the correct length,
  -- and then executes the expression succ' which checks the nested patterns.
  return $ ifpat (Bin And (Un IsTuple v NoPos) (Bin Eq (Un TupleLength v NoPos) (Lit (LNumeric (NumInt (toInteger (length pats))) _srcRT)) NoPos) NoPos) succ' fail
-- TODO Generate more efficient code:
-- Decompose the list v according to the pattern with a DFS pass.
-- This would benefit from an "is empty" operation (to not having to use the RT-dispatched equals).
-- A potentially expensive length calculation is then unnecessary.
-- However, this is more complicated, as would need unique name generation, also for potentially nested list patterns.
compilePattern succ (v, S.ListPattern pats) = do
  fail <- ask
  -- Accessors for the value to be assigned to the patterns.
  let accessors = map (\t -> Un Head t NoPos) $ iterate (\t -> Un Tail t NoPos) v
  -- Compile the nested patterns, combining the resulting terms for the respective patterns so that the left-most is evaluated first.
  succ' <- foldM compilePattern succ (reverse (zip accessors pats)) -- pairs of pattern (the nested ones in the list) and term accessing the value at the corresponding index in the list term
  -- The expression for the list pattern checks whether the to-be-assigned value is a list with the correct length,
  -- and then executes the expression succ' which checks the nested patterns.
  return $ ifpat (Bin And (Un IsList v NoPos) (Bin Eq (Un ListLength v NoPos) (Lit (LNumeric (NumInt (toInteger (length pats))) _srcRT)) NoPos) NoPos) succ' fail
compilePattern succ (v, S.ConsPattern p1 p2) = do
  fail <- ask
  succ' <- compilePattern succ (Un Head v NoPos, p1)
  succ'' <- compilePattern succ' (Un Tail v NoPos, p2)
  -- TODO Avoid list length (potentially expensive). Implement similarly to the improved list pattern (see above).
  return $ ifpat (Bin And (Un IsList v NoPos) (Bin Gt (Un ListLength v NoPos) (Lit (LNumeric (NumInt 0) _srcRT)) NoPos) NoPos) succ'' fail
compilePattern succ (v, S.RecordPattern fieldPatterns mode) = do
  fail <- ask
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
          return $ ifpat (Un IsRecord v NoPos) succ' fail
        ExactMatch ->
          -- Check that the record has exactly the specified number of fields
          let expectedSize = length fieldPatterns
              sizeCheck = Bin Eq (Un RecordSize v NoPos) (Lit (LNumeric (NumInt (fromIntegral expectedSize)) _srcRT)) NoPos
              recordCheck = Bin And (Un IsRecord v NoPos) sizeCheck NoPos
          in return $ ifpat recordCheck succ' fail
    where ifHasField f k = do
              succ' <- k
              fail <- ask
              let f' = Lit (LString f )
              return $ ifpat (Bin HasField v f' NoPos) succ' fail

          compileField succ (f, Just p) = do
              ifHasField f $ compilePattern succ (T.ProjField v f NoPos, p)

          compileField succ (f, Nothing) = do
              ifHasField f $ compilePattern succ (T.ProjField v f NoPos, S.VarPattern f)
  


-- | Tranform a declaration, compiling patterns into terms.
-- When there are multiple patterns like in functions or a case expression,
-- they are folded into a nested term, with an error expression innermost (after the last check).
-- The error expression is therefore passed as state of a Reader monad.
transDecl :: S.Decl -> Term -> Trans Term
transDecl (S.ValDecl pat t pos) succ = do
  let temp = "$decltemp$"
  t' <- transTerm t
  result <- runReaderT (compilePattern succ ((Var temp NoPos), pat)) (Error (Lit (LString "pattern match failure in let declaration")) pos)
  return $ Let [ValDecl temp t'] result NoPos
transDecl (S.FunDecs fundecs) succ = do
  fundecs' <- mapM transFunDecl fundecs
  return (Let [FunDecs fundecs'] succ NoPos)
  where
    argLength ((S.Lambda args _):_) = length args
    argLength [] = 0
    transFunDecl (S.FunDecl f lams pos) = do
      let lams' = map (transLambda_aux . (\(S.Lambda args e) -> S.Lambda [S.TuplePattern args] e)) lams
          names = map (((f ++ "_pat") ++) . show) [1..(length lams)]
          args =  map (((f ++ "_arg") ++) . show) [1..(argLength lams)]
          args' =  Tuple (map (\a -> Var a NoPos) args) NoPos
          errorMsg = Error (Lit (LString $ "pattern match failure in function " ++ f)) pos
      (fst, decls) <- foldr (\(n, l) acc -> do
            (fail, decls) <- acc
            lam <- runReaderT l fail
            return ( (App (Var n NoPos) [args'] NoPos)
                   , (ValDecl n (Abs lam NoPos)) : decls)
          ) (return (errorMsg, [])) (zip names lams')
      return (FunDecl f (Lambda args (Let (reverse decls) fst NoPos)))

transTerm :: S.Term -> Trans Term
transTerm (S.Lit lit) = return (T.Lit (transLit lit))
transTerm (S.Var v) = return (T.Var v NoPos)
transTerm (S.Abs l) = do
  l' <- transLambda l
  return (T.Abs l' NoPos)
transTerm (S.Hnd h) = do
  h' <- transHandler h
  return (T.Abs h' NoPos)
transTerm (S.App t1 args) = do
  t1' <- transTerm t1
  args' <- mapM transTerm args
  return (T.App t1' args' NoPos)
transTerm (S.Let decls t) = do
  t' <- transTerm t
  foldr (\decl acc -> do
          acc' <- acc
          transDecl decl acc'
        ) (return t') decls
transTerm (S.Case t cases pos) = do
  t' <- transTerm t
  cases' <- mapM (\(pat, succ) -> do
                    succ' <- transTerm succ
                    return (pat, succ')
                  ) cases
  let e = foldr (\(pat, succ') fail ->
            case runExcept (runReaderT (compilePattern succ' (Var "casevar" NoPos, pat)) fail) of
              Right result -> result
              Left err -> error err
          ) (Error (Lit (LString "pattern match failure in case expression")) pos) cases'
  return (Let [ValDecl "casevar" t'] e NoPos)
transTerm (S.If t1 t2 t3) = do
  t1' <- transTerm t1
  t2' <- transTerm t2
  t3' <- transTerm t3
  return (If t1' t2' t3' NoPos)
transTerm (S.Tuple tms) = do
  tms' <- mapM transTerm tms
  return (T.Tuple tms' NoPos)
transTerm (S.Record fields) = do
  fields' <- transFields fields
  return (T.Record fields' NoPos)
transTerm (S.WithRecord e fields) = do
  e' <- transTerm e
  fields' <- transFields fields
  return (T.WithRecord e' fields' NoPos)
transTerm (S.ProjField t f) = do
  t' <- transTerm t
  return (T.ProjField t' f NoPos)
transTerm (S.ProjIdx t idx) = do
  t' <- transTerm t
  return (T.ProjIdx t' idx NoPos)
transTerm (S.List tms) = do
  tms' <- mapM transTerm tms
  return (T.List tms' NoPos)
transTerm (S.ListCons t1 t2) = do
  t1' <- transTerm t1
  t2' <- transTerm t2
  return (T.ListCons t1' t2' NoPos)
transTerm (S.Bin op t1 t2) = do
  t1' <- transTerm t1
  t2' <- transTerm t2
  return (Bin op t1' t2' NoPos)
transTerm (S.Un op t) = do
  t' <- transTerm t
  return (Un op t' NoPos)
transTerm (S.Seq ts) =
    case reverse ts of
        [t] -> transTerm t
        body:ts_rev -> do
          let decls = map (\t -> S.ValDecl S.Wildcard t NoPos) (reverse ts_rev)
          transTerm (S.Let decls body)
        []  -> throwError "impossible case: sequence of empty terms"

transTerm (S.Error _) = throwError "impossible case: error"

transFields :: [(String, Maybe S.Term)] -> Trans [(String, T.Term)]
transFields = mapM $ \case
  (f, Nothing) -> return (f, T.Var f NoPos)
  (f, Just t) -> do
    t' <- transTerm t
    return (f, t')
