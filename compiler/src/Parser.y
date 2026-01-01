{
{-# LANGUAGE GeneralizedNewtypeDeriving #-}

module Parser (
  parseProg,
  parseTokens,
) where

import Lexer
import Direct
import DCLabels
import Basics
import TroupePositionInfo

import Control.Monad.Except
import Control.Monad.Reader
import Data.List (group, sort, intercalate)


}

-- Entry point
%name prog

-- Lexer structure
%tokentype { L Token }

-- Parser monad (ReaderT to thread filename for position info)
%monad { ReaderT FilePath (Except String) } { (>>=) } { return }
%error { parseError }

-- Token Names
%token
    let   { L _ TokenLet }
    in    { L _ TokenIn }
    end   { L _ TokenEnd }
    val   { L _ TokenVal }
    fun   { L _ TokenFun }
    and   { L _ TokenAnd }
    if    { L _ TokenIf }
    then  { L _ TokenThen }
    else  { L _ TokenElse }
    case  { L _ TokenCase }
    of    { L _ TokenOf }
    import { L _ TokenImport }
    datatype { L _ TokenDatatype }
    Atoms { L _ TokenAtoms }
    fn    { L _ TokenFn }
    hn    { L _ TokenHn }
    pini  { L _ TokenPini }
    when  { L _ TokenWhen }
    with  { L _ TokenWith }
    qualified { L _ TokenQualified }
    as    { L _ TokenAs }
    true  { L _ TokenTrue }
    false { L _ TokenFalse }
    andalso { L _ TokenAndAlso }
    orelse  { L _ TokenOrElse }
    NUM   { L _ (TokenNum _) }
    FLOAT { L _ (TokenFloat _) }
    STRING{ L _ (TokenString _)}
    VAR   { L _  (TokenSym _) }
    LABEL { L _  (TokenLabel _) }
    '@'   { L _  TokenAt }
    '=>'  { L _ TokenArrow }
    '='   { L _ TokenEq }
    '+'   { L _ TokenAdd }
    '-'   { L _ TokenSub }
    '*'   { L _ TokenMul }
    '/'   { L _ TokenDiv }
    ';'   { L _ TokenSemi }
    '^'   { L _ TokenCaret }
    '<='  { L _ TokenLe }
    '>='  { L _ TokenGe }
    '<'   { L _ TokenLt }
    '>'   { L _ TokenGt }
    '<>'  { L _ TokenNe }
    div { L _ TokenIntDiv }
    mod { L _ TokenMod }
    andb  { L _ TokenBinAnd }
    orb   { L _ TokenBinOr }
    xorb  { L _ TokenBinXor }
    '<<'    { L _ TokenBinShiftLeft }
    '>>'    { L _ TokenBinShiftRight }
    '~>>'   { L _ TokenBinZeroShiftRight }
    '`<'    { L _ TokenDCLabelLeft  } 
    '>`'    { L _ TokenDCLabelRight } 
    '&'     { L _ TokenAmpersand }
    '#root-confidentiality' { L _ TokenDCRootConf }
    '#null-confidentiality' { L _ TokenDCNullConf }
    '#root-integrity' { L _ TokenDCRootInteg }
    '#null-integrity' { L _ TokenDCNullInteg }    

    'raisedTo' { L _ TokenRaisedTo }
    'isTuple' { L _ TokenIsTuple }
    'isList' { L _ TokenIsList }
    'isRecord' { L _ TokenIsRecord }
    'not' { L _ TokenNot }

    '('   { L _ TokenLParen }
    ')'   { L _ TokenRParen }
    ','   { L _ TokenComma }
    '_'   { L _ TokenWildcard }
    '|'   { L _ TokenBar }
    '::'  { L _ TokenColonColon }
    '['   { L _ TokenLBracket }
    ']'   { L _ TokenRBracket }
    '.'   { L _ TokenDot }
    '..'  { L _ TokenDotDot }
    '{'   { L _ TokenLBrace }
    '}'   { L _ TokenRBrace }



-- Operators


%nonassoc with
%right '=>' 
%right '|'
%right else 
%right ';'
%left andalso orelse
%nonassoc '=' '<=' '>=' '<>' '<' '>' '@'
%left andb orb xorb
%left '<<' '>>' '~>>'
%left '+' '-' 
%left '*' '/' div mod
%left '|' 
%left '&'
%right '::'
%right '.'

%left 'raisedTo'
%left 'isTuple'
%left 'isList'
%left 'isRecord'
%left 'not'
%left '^'
%%




Prog : ImportDecl AtomsDecl Expr                       { Prog (Imports $1) (Atoms $2) $3 }

ImportDecl: import OptQualified OptSelection VAR OptAlias ImportDecl
              { (ImportDecl (LibName (varTok $4)) $5 Nothing $3 $2) : $6 }
          | { [] }

OptQualified : qualified  { Qualified }
             | { Unqualified }

OptSelection : '{' VarList '}'  { Just $2 }
             | { Nothing }

OptAlias : as VAR   { Just (LibName (varTok $2)) }
         | { Nothing }

VarList : VAR              { [varTok $1] }
        | VAR ',' VarList  { (varTok $1) : $3 }


AtomsDecl : datatype Atoms '=' VAR AtomsList    {% do { p <- pos $4; checkDuplicateAtoms ((varTok $4, p):$5) } }
          |  {[]}

AtomsList : { [] }
          | '|' VAR AtomsList  {% do { p <- pos $2; return ((varTok $2, p): $3) } }


Expr: Form                        { $1 }
    | let pini Expr Decs in Expr end  {% Let (piniDecl $3 $4) $6 <\$> pos $1 }
    | let Decs in Expr end        {% Let $2 $4 <\$> pos $1 }
    | if Expr then Expr else Expr {% If $2 $4 $6 <\$> pos $1 }
    | fn Pattern '=>' Expr        {% Abs (Lambda [$2] $4) <\$> pos $1 }
    | hn Pattern '=>' Expr        {% Hnd (Handler $2 Nothing Nothing $4) <\$> pos $1 }
    | hn Pattern '|' Pattern '=>' Expr      {% Hnd (Handler $2 (Just $4) Nothing $6) <\$> pos $1 }
    | hn Pattern when Expr '=>' Expr        {% Hnd (Handler $2 Nothing (Just $4) $6) <\$> pos $1 }
    | hn Pattern '|' Pattern when Expr '=>' Expr      {% Hnd (Handler $2 (Just $4) (Just $6) $8) <\$> pos $1 }
    | case Expr of Match          {% Case $2 $4 <\$> pos $1 }
    | Expr ';' Expr               {% mkSeq $1 $3 <\$> pos $2 }
    | Expr '-' Expr               {% Bin Minus $1 $3 <\$> pos $2 }
    | Expr '+' Expr               {% Bin Plus $1 $3 <\$> pos $2 }
    | Expr '>=' Expr              {% Bin Ge $1 $3 <\$> pos $2 }
    | Expr '*' Expr               {% Bin Mult $1 $3 <\$> pos $2 }
    | Expr '/' Expr               {% Bin Div $1 $3 <\$> pos $2 }
    | Expr div Expr               {% Bin IntDiv $1 $3 <\$> pos $2 }
    | Expr mod Expr               {% Bin Mod $1 $3 <\$> pos $2 }
    | Expr '^' Expr               {% Bin Concat $1 $3 <\$> pos $2 }
    | Expr '=' Expr               {% Bin Eq $1 $3 <\$> pos $2 }
    | Expr '<=' Expr              {% Bin Le $1 $3 <\$> pos $2 }
    | Expr '<' Expr               {% Bin Lt $1 $3 <\$> pos $2 }
    | Expr '>' Expr               {% Bin Gt $1 $3 <\$> pos $2 }
    | Expr '<>' Expr              {% Bin Neq $1 $3 <\$> pos $2 }
    | Expr andalso Expr           {% Bin And $1 $3 <\$> pos $2 }
    | Expr orelse  Expr           {% Bin Or $1 $3 <\$> pos $2 }
    | Expr andb Expr              {% Bin BinAnd $1 $3 <\$> pos $2 }
    | Expr orb Expr               {% Bin BinOr $1 $3 <\$> pos $2 }
    | Expr xorb Expr              {% Bin BinXor $1 $3 <\$> pos $2 }
    | Expr '<<' Expr              {% Bin BinShiftLeft $1 $3 <\$> pos $2 }
    | Expr '>>' Expr              {% Bin BinShiftRight $1 $3 <\$> pos $2 }
    | Expr '~>>' Expr             {% Bin BinZeroShiftRight $1 $3 <\$> pos $2 }
    | Expr '::' Expr              {% ListCons $1 $3 <\$> pos $2 }
    | Expr 'raisedTo' Expr        {% Bin RaisedTo $1 $3 <\$> pos $2 }
    | 'isTuple' Expr              {% Un IsTuple $2 <\$> pos $1 }
    | 'isList' Expr               {% Un IsList $2 <\$> pos $1 }
    | 'isRecord' Expr             {% Un IsRecord $2 <\$> pos $1 }
    | 'not' Expr                  {% Un Not $2 <\$> pos $1 }


Match : Pattern '=>' Expr                      { [($1,$3)] }
      | Pattern '=>' Expr '|' Match            { ($1,$3):$5 }


Form :: { Term }
Form :  '-' Form                    {% Un UnMinus $2 <\$> pos $1 }
     | Fact                        { fromFact $1 }


Fact : Fact Atom                   { $2 : $1 }
     | Atom                        { [$1] }


LabelExp: 
       VAR                         { TagExp (varTok $1) }
     | '(' LabelExp ')'            { $2 }
     | LabelExp '&'  LabelExp      { OpExp Conj $1 $3 } 
     | LabelExp '|'  LabelExp      { OpExp Disj $1 $3 }

ConfLabelExp :                     { ConstComponent LabelTrue }
     | '#root-confidentiality'     { ConstComponent LabelFalse }
     | '#null-confidentiality'     { ConstComponent LabelTrue }
     | LabelExp                    { ExprComponent $1 }

IntLabelExp :                      { ConstComponent LabelTrue }
     | '#root-integrity'           { ConstComponent LabelFalse }
     | '#null-integrity'           { ConstComponent LabelTrue }
     | LabelExp                    { ExprComponent $1 }     

DCLabelExp:
     ConfLabelExp ';' IntLabelExp         { DCLabelExp ($1, $3) } 

Lit:   NUM                        {% LNumeric (NumInt (numTok $1)) <\$> pos $1 }
     | FLOAT                       {% LNumeric (NumFloat (floatTok $1)) <\$> pos $1 }
     | STRING                      { LString (strTok $1) }
     | true                        { LBool True }
     | false                       { LBool False }
     | LABEL                       { LLabel (lblTok $1) }
     |'`<' DCLabelExp '>`'         { LDCLabel $2 }  
     


Atom : '(' Expr ')'                { $2 }
     | Lit                         { Lit $1 }
     | VAR                         {% Var (varTok $1) <\$> pos $1 }
     | '(' ')'                     { Lit LUnit }
     | '(' CSExpr Expr ')'         {% Tuple (reverse ($3:$2)) <\$> pos $1 }
     | '{' '}'                     {% Record [] <\$> pos $1 }
     | RecordExpr                  { $1 }
     | ListExpr                    { $1 }
     | Atom '.' VAR                {% ProjField $1 (varTok $3) <\$> pos $2 }
     | Atom '.' NUM                {% ProjIdx $1 (fromInteger (numTok $3)) <\$> pos $2 }


RecordExpr
     : '{' RecordFields  '}'          {% Record $2 <\$> pos $1 }
     | '{' Atom with RecordFields'}'  {% WithRecord $2 $4 <\$> pos $1 }
     

RecordFields
     : Field                           { [$1] }
     | Field ',' RecordFields          { $1 : $3 }


Field 
     : VAR                         { (varTok $1, Nothing) }
     | VAR '=' Expr                { (varTok $1, Just $3) }
     


ListExpr :: {Term}
ListExpr : '[' ']'                 {% List [] <\$> pos $1 }
     | '[' Expr ']'                {% List [$2] <\$> pos $1 }
     | '[' CSExpr Expr ']'         {% List (reverse ($3:$2)) <\$> pos $1 }

CSExpr : Expr ','                  { [$1] }
     | CSExpr Expr ','             { ($2:$1) }


Pattern : VAR                               { VarPattern (varTok $1) }
    | '(' Pattern ')'                       { $2 }
    | Pattern '@' LABEL                     { AtPattern $1 (lblTok $3) }
    | '(' ')'                               { ValPattern LUnit }
    | '_'                                   { Wildcard }
    | Lit                                   { ValPattern $1 }
    | '(' CSPattern Pattern ')'             { TuplePattern (reverse ($3:$2)) }
    | FieldPattern                          { $1 }
    | ListPattern   { $1}


FieldPattern :
      '{' '}'                                        { RecordPattern [] ExactMatch }
    | '{' '..' '}'                                   { RecordPattern [] WildcardMatch }
    | '{' FieldPat '}'                               { RecordPattern [$2] ExactMatch }
    | '{' FieldPat ',' '..' '}'                      { RecordPattern [$2] WildcardMatch }     
    | '{' FieldPatterns FieldPat '}'                 { RecordPattern (reverse ($3:$2)) ExactMatch }
    | '{' FieldPatterns FieldPat ',' '..' '}'        { RecordPattern (reverse ($3:$2)) WildcardMatch }


FieldPatterns
    : FieldPat ','                  { [$1]    } 
    | FieldPatterns FieldPat ','    { ($2:$1 )} 


FieldPat 
    : VAR              {(varTok $1, Nothing) }
    | VAR '=' Pattern  {(varTok $1, Just $3) }

ListPattern:  '[' ']'                              { ListPattern [] }
    | '[' Pattern ']'                              { ListPattern [$2] }
    | '[' CSPattern Pattern ']'                    { ListPattern (reverse ($3:$2)) }
    |     Pattern '::' Pattern                     { ConsPattern  $1 $3 }


CSPattern : Pattern ','         { [$1] }
    | CSPattern  Pattern ','    { ($2:$1) }


Dec : val Pattern '=' Expr      {% ValDecl $2 $4 <\$> pos $1 }
    | FunDecs                      { FunDecs $1 }

Decs : Dec                         { [$1] }
     | Dec Decs                    { $1 : $2 }

FunDecs : FunDecl                  { [$1] }
      | FunDecl AndFunDecs         { $1 : $2 }

AndFunDecs : AndFunDecl            { [$1] }
           | AndFunDecl AndFunDecs { $1 : $2 }




FunOptions : FirstFunOption         { [$1] }
   | FirstFunOption OtherFunOptions { $1: $2}

OtherFunOptions : OtherFunOption   {[ $1 ]}
  | OtherFunOption OtherFunOptions { $1 : $2 }

FirstFunOption : FunArgs '=' Expr   { Lambda $1 $3}

OtherFunOption : '|' VAR FunArgs '=' Expr { Lambda $3 $5}


FunDecl    : fun VAR FunOptions {% pos $2 >>= \p -> return (FunDecl (varTok $2) $3 p) }
AndFunDecl : and VAR FunOptions {% pos $2 >>= \p -> return (FunDecl (varTok $2) $3 p) }

FunArgs : Pattern                        { [$1]  }
        | Pattern FunArgs                { $1 : $2}

{


piniDecl auth decs =
    let pushDecl = ValDecl (VarPattern "$pini") (App  (Var "pinipush" NoPos) [auth] NoPos) (RTGen "parser")
        popDecl  = ValDecl Wildcard (App (Var "pinipop" NoPos) [Var "$pini" NoPos] NoPos) (RTGen "parser")
    in
        (pushDecl:decs) ++ [popDecl]

mkSeq :: Term -> Term -> PosInf -> Term
mkSeq t1 t2 p =
    let ts = case t2 of (Seq ts _) -> ts
                        _ -> [t2]
    in Seq (t1: ts) p


fromFact [x] = x
fromFact xs =
  let (y:ys) = reverse xs
  in App y ys (termPos y)

-- Extract position from a Term (for function application, we use the function's position)
termPos :: Term -> PosInf
termPos (Lit (LNumeric _ p)) = p
termPos (Lit _) = NoPos
termPos (Var _ p) = p
termPos (Abs _ p) = p
termPos (Hnd _ p) = p
termPos (App _ _ p) = p
termPos (Let _ _ p) = p
termPos (Case _ _ p) = p
termPos (If _ _ _ p) = p
termPos (Tuple _ p) = p
termPos (Record _ p) = p
termPos (WithRecord _ _ p) = p
termPos (ProjField _ _ p) = p
termPos (ProjIdx _ _ p) = p
termPos (List _ p) = p
termPos (ListCons _ _ p) = p
termPos (Bin _ _ _ p) = p
termPos (Un _ _ p) = p
termPos (Seq _ p) = p
termPos (Error _ p) = p


parseError :: [L Token] -> ReaderT FilePath (Except String) a
parseError (l:ls) = do
    filename <- ask
    let (AlexPn _ line col) = getPos l
    let tks = unPos l
    let prefix = if null filename then "" else filename ++ ":"
    throwError $ prefix ++ show line ++ ":" ++ show col  ++ " unexpected token " ++ (show tks)
parseError [] = throwError "Unexpected end of input"


parseTokens :: String -> Either String [L Token]
parseTokens = runExcept . scanTokens


parseProg :: FilePath -> String -> Either String Prog
parseProg filename input = runExcept $ do
  tokenStream <- scanTokens input
  runReaderT (prog tokenStream) filename


numTok (L _ (TokenNum x))    = x
floatTok (L _ (TokenFloat x)) = x
strTok (L _ (TokenString x)) = x
varTok (L _ (TokenSym x ))   = x
lblTok (L _ (TokenLabel x))  = x

pos :: L Token -> ReaderT FilePath (Except String) PosInf
pos l = do
    filename <- ask
    let (AlexPn _ line col) = getPos l
    return $ SrcPosInf filename line col

-- Check for duplicate atom names and report all duplicates with positions
checkDuplicateAtoms :: [(String, PosInf)] -> ReaderT FilePath (Except String) [AtomName]
checkDuplicateAtoms atoms
  | null dups = return names
  | otherwise = throwError $ intercalate "\n" (map formatOne dups)
  where
    names = map fst atoms
    dups = [n | (n:_:_) <- group (sort names)]
    formatOne d =
      let positions = [p | (n, p) <- atoms, n == d]
      in "Duplicate constructor '" ++ d ++ "' at " ++
         intercalate " and " (map show positions)

}
