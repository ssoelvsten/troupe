module AtomFolding ( visitProg )
where
import Basics
import Direct
import Data.Maybe
import Control.Monad

visitProg :: Prog -> Prog
visitProg (Prog imports (Atoms atms) tm) =
  Prog imports (Atoms atms) (visitTerm atms tm)

visitTerm :: [AtomName] -> Term -> Term
visitTerm atms (Lit lit) = Lit lit
visitTerm atms (Var nm pos) =
  if (elem nm atms)
  then Lit (LAtom nm)
  else Var nm pos
visitTerm atms (Abs lam pos) =
  Abs (visitLambda atms lam) pos
visitTerm atms (Hnd (Handler pat maybePat maybeTerm term) pos) =
  Hnd (Handler (visitPattern atms pat)
       (liftM (visitPattern atms) maybePat)
       (liftM (visitTerm atms) maybeTerm)
       (visitTerm atms term)) pos
visitTerm atms (App t1 ts pos) =
  App (visitTerm atms t1) (map (visitTerm atms) ts) pos
visitTerm atms (Let decls term pos) =
  Let (map visitDecl decls) (visitTerm atms term) pos
  where
    visitDecl (ValDecl pat t p) = ValDecl (visitPattern atms pat) (visitTerm atms t) p
    visitDecl (FunDecs decs) =
      FunDecs (map (\(FunDecl nm lams p) -> (FunDecl nm (map (visitLambda atms) lams) p)) decs)
visitTerm atms (Case t declTermList p) =
  Case (visitTerm atms t)
  (map (\(pat, term) -> ((visitPattern atms pat), (visitTerm atms term))) declTermList)
  p
visitTerm atms (If t1 t2 t3 pos) =
  If (visitTerm atms t1) (visitTerm atms t2) (visitTerm atms t3) pos
visitTerm atms (Tuple terms pos) =
  Tuple (map (visitTerm atms) terms) pos
visitTerm atms (Record fields pos) = Record (visitFields atms fields) pos
visitTerm atms (WithRecord e fields pos) =
    WithRecord (visitTerm atms e) (visitFields atms fields) pos
visitTerm atms (ProjField t f pos) =
    ProjField (visitTerm atms t) f pos
visitTerm atms (ProjIdx t idx pos) =
    ProjIdx (visitTerm atms t) idx pos
visitTerm atms (List terms pos) =
  List (map (visitTerm atms) terms) pos
visitTerm atms (ListCons t1 t2 pos) =
  ListCons (visitTerm atms t1) (visitTerm atms t2) pos
visitTerm atms (Bin op t1 t2 pos) =
  Bin op (visitTerm atms t1) (visitTerm atms t2) pos
visitTerm atms (Un op t pos) =
  Un op (visitTerm atms t) pos
visitTerm atms (Seq ts pos) =
  Seq (map (visitTerm atms) ts) pos
visitTerm atms (Error t pos) =
  Error (visitTerm atms t) pos


visitFields atms fs  =  map visitField fs   
    where visitField (f, Nothing) = (f, Nothing) 
          visitField (f, Just t) = (f, Just (visitTerm atms t))

visitPattern :: [AtomName] -> DeclPattern -> DeclPattern
visitPattern atms pat@(VarPattern nm pos) =
  if (elem nm atms)
  then ValPattern (LAtom nm) pos
  else pat
visitPattern _ pat@(ValPattern _ _) = pat
visitPattern atms (AtPattern p l pos) = AtPattern (visitPattern atms p) l pos
visitPattern _ pat@(Wildcard _) = pat
visitPattern atms (TuplePattern pats pos) = TuplePattern (map (visitPattern atms) pats) pos
visitPattern atms (ConsPattern p1 p2 pos) = ConsPattern (visitPattern atms p1) (visitPattern atms p2) pos
visitPattern atms (ListPattern pats pos) = ListPattern (map (visitPattern atms) pats) pos
visitPattern atms (RecordPattern fields mode pos) = RecordPattern (map visitField fields) mode pos
      where visitField pat@(_, Nothing) = pat
            visitField (f, Just p) = (f, Just (visitPattern atms p))

visitLambda :: [AtomName] -> Lambda -> Lambda
visitLambda atms (Lambda pats term) =
  (Lambda (map (visitPattern atms) pats) (visitTerm atms term))
