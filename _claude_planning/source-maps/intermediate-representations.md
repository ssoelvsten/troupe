# Troupe Compiler Intermediate Representations

This document outlines all intermediate representations (IRs) in the Troupe compiler pipeline, from parsing to JavaScript code generation.

## Pipeline Overview

```
Source Code (.trp)
       ↓
    Parser (Parser.y)
       ↓
┌──────────────────┐
│  Direct (Syntax) │  Multi-arg lambdas, patterns, handlers
└──────────────────┘
       ↓  CaseElimination.trans
┌──────────────────┐
│  DirectWOPats    │  No patterns, embedded positions, assertions
└──────────────────┘
       ↓  Core.lowerProg + renameProg
┌──────────────────┐
│      Core        │  Unary lambdas, variable resolution, Located terms
└──────────────────┘
       ↓  RetDFCPS.transProg
┌──────────────────┐
│     RetCPS       │  CPS form, simple terms, continuations
└──────────────────┘
       ↓  ClosureConv.closureConvert
┌──────────────────┐
│       IR         │  Closure-converted, basic blocks, environments
└──────────────────┘
       ↓  IR2Raw.prog2raw
┌──────────────────┐
│      Raw         │  Labelled/unlabelled separation, runtime ops
└──────────────────┘
       ↓  Raw2Stack.rawProg2Stack
┌──────────────────┐
│     Stack        │  Explicit stack operations, frame sizes
└──────────────────┘
       ↓  Stack2JS.stack2JSWithMappings
┌──────────────────┐
│   JavaScript     │  Executable code + source maps
└──────────────────┘
```

---

## 1. Direct (Syntax) - `Direct.hs`

**Source:** `Parser.y` → `Direct.hs`

**Purpose:** Direct representation from the parser, closely mirrors Troupe source syntax.

### Key Data Types

```haskell
data Term
    = Lit Lit
    | Var VarName
    | Abs Lambda                  -- Function abstractions
    | Hnd Handler                 -- Message handlers
    | App LTerm [LTerm]           -- Application with multiple arguments
    | Let [Decl] LTerm            -- Let bindings
    | Case LTerm [(LDeclPattern, LTerm)]  -- Pattern matching
    | If LTerm LTerm LTerm
    | Tuple [LTerm]
    | Record LFields
    | WithRecord LTerm LFields
    | ProjField LTerm FieldName
    | ProjIdx LTerm Word
    | List [LTerm]
    | ListCons LTerm LTerm
    | Bin BinOp LTerm LTerm
    | Un UnaryOp LTerm
    | Seq [LTerm]                 -- Sequence operations
    | Error LTerm

data Lambda = Lambda [LDeclPattern] LTerm
data Handler = Handler LDeclPattern (Maybe LDeclPattern) Guard LTerm

data Lit
    = LNumeric Numeric PosInf     -- Numbers with position info
    | LUnit
    | LBool Bool
    | LString String
    | LLabel String               -- V1 labels `{alice}`
    | LDCLabel DCLabelExp         -- DC labels `<alice;alice>`
    | LAtom AtomName
```

### Position Tracking

- Uses `Located` wrapper: `type LTerm = Located Term`
- `Located` is defined as: `data Located a = Loc !PosInf a`
- `PosInf` types:
  - `SrcPosInf String Int Int` (filename, row, col)
  - `RTGen String` (runtime generated)
  - `NoPos` (no position info)

### Characteristics

- Supports full pattern matching with `Case`
- Multi-argument lambdas: `Lambda [LDeclPattern] LTerm`
- Handler syntax for actors
- Full source code fidelity

---

## 2. DirectWOPats - `DirectWOPats.hs`

**Transformation:** `CaseElimination.trans`

**Purpose:** Eliminate pattern matching, convert to simple variable bindings.

### Key Data Types

```haskell
data Term
    = Lit Lit
    | Var VarName PosInf          -- Position embedded directly
    | Abs Lambda PosInf
    | App Term [Term] PosInf      -- Position embedded
    | Let [Decl] Term PosInf
    | If Term Term Term PosInf
    | AssertElseError Term Term Term ErrorPosInf  -- NEW: for assertions
    | Tuple [Term] PosInf
    | Record Fields PosInf
    | WithRecord Term Fields PosInf
    | ProjField Term FieldName PosInf
    | ProjIdx Term Word PosInf
    | List [Term] PosInf
    | ListCons Term Term PosInf
    | Bin BinOp Term Term PosInf
    | Un UnaryOp Term PosInf
    | Error Term ErrorPosInf

data Lambda = Lambda [(VarName, PosInf)] Term
data Decl
    = ValDecl VarName Term        -- Simple variable bindings
    | FunDecs [FunDecl]

data FunDecl = FunDecl VarName Lambda PosInf
```

### Position Tracking

- Positions embedded **directly in Term constructors** (not using `Located` wrapper)
- `PosInf` for most term positions
- `ErrorPosInf` wrapper specifically for error source locations (Error, AssertElseError)
- Lambda arguments have paired `(VarName, PosInf)` for argument positions

### Key Differences from Direct

| Direct | DirectWOPats |
|--------|--------------|
| `Case` patterns | Eliminated → `If` + `AssertElseError` |
| `Located Term` | Embedded `PosInf` in each constructor |
| `Lambda [LDeclPattern]` | `Lambda [(VarName, PosInf)]` |
| No `AssertElseError` | Introduced for pattern match assertions |

---

## 3. Core - `Core.hs`

**Transformations:** `lowerProg` and `renameProg`

**Purpose:**
- Lower multi-argument lambdas to unary (curried)
- Resolve library references and base functions
- Perform alpha-renaming for variable uniqueness

### Key Data Types

```haskell
data Lambda
    = Unary VarName PosInf LTerm  -- Unary lambda with argument position
    | Nullary LTerm               -- Zero-argument lambda

data Term
    = Lit Lit
    | Var VarAccess               -- Can be RegVar, LibVar, or BaseName
    | Abs Lambda                  -- Unary lambdas only
    | App LTerm LTerm             -- Binary application (curried)
    | Let Decl LTerm              -- Single declaration per Let
    | If LTerm LTerm LTerm
    | AssertElseError LTerm LTerm LTerm
    | Tuple [LTerm]
    | Record LFields
    | WithRecord LTerm LFields
    | ProjField LTerm FieldName
    | ProjIdx LTerm Word
    | List [LTerm]
    | ListCons LTerm LTerm
    | Bin BinOp LTerm LTerm
    | Un UnaryOp LTerm
    | Error LTerm

data VarAccess
    = RegVar VarName              -- Regular variable (renamed)
    | LibVar LibName VarName      -- Library function reference
    | BaseName VarName            -- Built-in function (send, receive, etc.)

type LTerm = Located Term
```

### Position Tracking

- Returns to `Located` wrapper: `type LTerm = Located Term`
- Terms contain no embedded position information
- Uses `GetPosInfo` typeclass to extract positions from `Located` wrappers
- Argument positions in `Lambda.Unary`: `Unary VarName PosInf LTerm`

### Key Differences from DirectWOPats

| DirectWOPats | Core |
|--------------|------|
| Embedded `PosInf` | `Located` wrapper |
| `App Term [Term]` | `App LTerm LTerm` (curried) |
| `Let [Decl] Term` | `Let Decl LTerm` (single) |
| Multi-arg `Lambda` | Unary/Nullary `Lambda` |
| `VarName` | `VarAccess` (RegVar/LibVar/BaseName) |

---

## 4. RetCPS (CPS Form) - `RetCPS.hs`

**Transformation:** `RetDFCPS.transProg`

**Purpose:** Convert to Continuation-Passing Style for explicit control flow.

### Key Data Types

```haskell
data KTerm
    = LetSimple VarName LSimpleTerm LKTerm  -- Assign simple value
    | LetFun [(Located FunDef)] LKTerm      -- Define functions
    | LetRet ContDef LKTerm                 -- Define continuation
    | KontReturn VarName                    -- Return value
    | ApplyFun VarName VarName              -- Function application (tail call)
    | If VarName LKTerm LKTerm              -- Conditional on variable
    | AssertElseError VarName LKTerm VarName ErrorPosInf
    | Error VarName ErrorPosInf
    | Halt VarName                          -- Exit point

data SimpleTerm
    = Bin BinOp LVarName LVarName
    | Un UnaryOp LVarName
    | ValSimpleTerm SVal              -- Literal or function
    | Tuple [LVarName]
    | Record LFields
    | WithRecord LVarName LFields
    | ProjField LVarName FieldName
    | ProjIdx LVarName Word
    | List [LVarName]
    | ListCons LVarName LVarName
    | Base VarName                    -- Built-in function
    | Lib LibName VarName             -- Library function

data SVal
    = KAbs KLambda                    -- Closure (function value)
    | Lit Lit                         -- Literal value

data KLambda
    = Unary VarName PosInf LKTerm
    | Nullary LKTerm

data ContDef = Cont VarName LKTerm
data FunDef = Fun VarName KLambda

type LKTerm = Located KTerm
type LSimpleTerm = Located SimpleTerm
type LVarName = Located VarName
```

### Position Tracking

- Uses `Located` wrapper extensively
- All variable references wrapped: `type LVarName = Located VarName`
- Function definitions wrapped: `Located FunDef`
- Argument positions in `KLambda`: `Unary VarName PosInf LKTerm`
- Error positions: `ErrorPosInf` for Error and AssertElseError

### Characteristics

- **All values are variables** (no nested expressions)
- Computations explicit via let-bindings
- Only simple operations in `SimpleTerm`
- Explicit continuations via `ContDef`
- Tail calls via `ApplyFun`

---

## 5. IR (Closure-Converted) - `IR.hs`

**Transformation:** `ClosureConv.closureConvert`

**Purpose:** Convert closures to explicit environments, ready for code generation.

### Key Data Types

```haskell
data IRExpr
    = Bin BinOp LVarAccess LVarAccess
    | Un UnaryOp LVarAccess
    | Tuple [LVarAccess]
    | Record LFields
    | WithRecord LVarAccess LFields
    | ProjField LVarAccess FieldName
    | ProjIdx LVarAccess Word
    | List [LVarAccess]
    | ListCons LVarAccess LVarAccess
    | Const Lit                       -- Constants
    | Base VarName                    -- Built-in function
    | Lib LibName VarName             -- Library function

data VarAccess
    = VarLocal VarName                -- Local variable
    | VarEnv VarName                  -- Variable from closure environment
    | VarFunSelfRef                   -- Self-reference (for recursion)

data IRTerminator
    = TailCall VarAccess VarAccess    -- (function, argument)
    | Ret VarAccess                   -- Return value
    | If VarAccess IRBBTree IRBBTree  -- Conditional
    | AssertElseError VarAccess IRBBTree VarAccess ErrorPosInf
    | LibExport VarAccess             -- Export library
    | Error VarAccess ErrorPosInf     -- Error termination
    | StackExpand VarName IRBBTree IRBBTree

data IRInst
    = Assign VarName IRExpr           -- Variable assignment
    | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]

data IRBBTree = BB [LIRInst] LIRTerminator  -- Basic block

data FunDef = FunDef HFN VarName PosInf Consts IRBBTree

type LIRInst = Located IRInst
type LIRTerminator = Located IRTerminator
type LVarAccess = Located VarAccess
```

### Position Tracking

- Uses `Located` wrapper: `LIRInst`, `LIRTerminator`, `LVarAccess`
- Argument position embedded in `FunDef`
- Error positions: `ErrorPosInf`

### Characteristics

- **Closures become explicit environment capture**
- Variables are `VarLocal` or `VarEnv` (from closure)
- Basic block structure with terminators
- `MkFunClosures` creates closures with captured variables

---

## 6. Raw - `Raw.hs`

**Transformation:** `IR2Raw.prog2raw`

**Purpose:** Lower to runtime-specific operations, introduce label handling for IFC.

### Key Data Types

```haskell
data RawVar = RawVar Ident            -- Variables for unlabelled values

data RawExpr
    = Bin BinOp UseNativeBinop RawVar RawVar
    | Un UnaryOp RawVar
    | ProjectLVal VarAccess LValField  -- Extract from labelled value
    | ProjectState MonComponent        -- Extract monitor state
    | Tuple [VarAccess]
    | Record Fields
    | WithRecord RawVar Fields
    | ProjField RawVar FieldName
    | ProjIdx RawVar Word
    | List [VarAccess]
    | ListCons VarAccess RawVar
    | Const Lit
    | Lib LibName VarName
    | Base VarName
    | ConstructLVal RawVar RawVar RawVar  -- (val, lev, tlev)

data LValField = FieldValue | FieldValLev | FieldTypLev

data MonComponent = MonPC | MonBlock | R0_Val | R0_Lev | R0_TLev

data RawInst
    = AssignRaw RawVar RawExpr        -- Unlabelled value assignment
    | AssignLVal VarName RawExpr      -- Labelled value assignment
    | SetState MonComponent RawVar    -- Update monitor state
    | SetBranchFlag
    | InvalidateSparseBit
    | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]
    | RTAssertion RTAssertion         -- Runtime type assertions
    | SourcePosAnnotation RawVar      -- Source position marker

data RawBBTree = BB [LRawInst] LRawTerminator

data RawTerminator
    = TailCall RawVar
    | Ret
    | If RawVar RawBBTree RawBBTree
    | LibExport VarAccess
    | Error RawVar
    | StackExpand RawBBTree RawBBTree

type LRawInst = Located RawInst
type LRawTerminator = Located RawTerminator
```

### Position Tracking

- Uses `Located` wrapper for instructions and terminators
- `SourcePosAnnotation RawVar` preserves eliminated instruction positions
- Position used for source map generation

### Characteristics

- **Separates labelled from unlabelled values**
- Labelled values (with security labels) use `LVal` structure
- Explicit runtime state operations (PC, block, labels)
- Fast-path flag for native binary operations
- Runtime assertions for type checking

---

## 7. Stack - `Stack.hs`

**Transformation:** `Raw2Stack.rawProg2Stack`

**Purpose:** Introduce explicit stack operations and memory layout.

### Key Data Types

```haskell
data StackInst
    = AssignRaw RawAssignType RawVar RawExpr
    | LabelGroup [LStackInst]         -- Group label-related instructions
    | AssignLVal VarName RawExpr
    | FetchStack Assignable StackPos  -- Load from stack
    | StoreStack Assignable StackPos  -- Store to stack
    | SetState MonComponent RawVar
    | SetBranchFlag
    | InvalidateSparseBit
    | MkFunClosures [(VarName, VarAccess)] [(VarName, HFN)]
    | RTAssertion RTAssertion
    | SourcePosAnnotation RawVar      -- Source position marker

data RawAssignType
    = AssignConst                     -- Const assignment
    | AssignLet                       -- Let binding
    | AssignMut                       -- Mutable assignment

data StackBBTree = BB [LStackInst] LStackTerminator

data FunDef = FunDef HFN Int Consts StackBBTree IR.FunDef

type StackPos = Int
type LStackInst = Located StackInst
type LStackTerminator = Located StackTerminator
```

### Position Tracking

- Uses `Located` wrapper
- Source position annotations preserved
- Stack positions are integers (memory offsets)

### Characteristics

- **Explicit stack memory management**
- Distinguishes const/let/mutable assignments
- Explicit fetch/store operations
- Label-group instructions for IFC-aware scheduling
- Frame size computed

---

## 8. JavaScript Output - `Stack2JS.hs`

**Transformation:** `Stack2JS.stack2JSWithMappings`

**Purpose:** Generate executable JavaScript with optional source maps.

### Output

- JavaScript code (string)
- Source map mappings (line/column pairs)

### Source Map Generation

- Original source positions from `Located` wrappers
- Generated code positions tracked during emission
- `SourcePosAnnotation` markers for eliminated instructions

---

## Position Information Summary

| IR Stage | Position Method | Error Position |
|----------|-----------------|----------------|
| **Direct** | `Located` wrapper | N/A |
| **DirectWOPats** | Embedded `PosInf` | `ErrorPosInf` |
| **Core** | `Located` wrapper | In `Located` |
| **RetCPS** | `Located` wrapper | `ErrorPosInf` |
| **IR** | `Located` wrapper | `ErrorPosInf` |
| **Raw** | `Located` + annotations | In `Located` |
| **Stack** | `Located` + annotations | In `Located` |
| **JavaScript** | Source map mappings | In source map |

---

## Key Transformations

1. **Pattern Elimination** (Direct → DirectWOPats)
   - Convert `Case` patterns to nested `If` + `AssertElseError`
   - Switch from `Located` wrapper to embedded positions

2. **Lowering & Renaming** (DirectWOPats → Core)
   - Convert to `Located` wrapper
   - Multi-arg lambdas → Unary lambdas (currying)
   - Resolve library/base function names
   - Alpha-rename for uniqueness

3. **CPS Transformation** (Core → RetCPS)
   - All values become variables
   - Explicit continuations
   - Simple terms only

4. **Closure Conversion** (RetCPS → IR)
   - Explicit closure environments
   - Basic block structure
   - `VarLocal` vs `VarEnv` distinction

5. **Lowering to Raw** (IR → Raw)
   - Separate labelled/unlabelled values
   - Introduce monitor operations
   - Runtime type assertions

6. **Stack Introduction** (Raw → Stack)
   - Explicit stack operations
   - Memory layout decisions
   - Const/let/mutable tracking

7. **Code Generation** (Stack → JS)
   - Generate JavaScript
   - Emit source maps
