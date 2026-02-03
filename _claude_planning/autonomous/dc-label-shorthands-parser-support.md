# Design Document: Parser Support for `#BOT`, `#TOP`, `#NULL`, `#ROOT` Label Shorthands

## Overview

This document outlines the changes needed to add parser support for `#BOT`, `#TOP`, `#NULL`, `#ROOT` as complete DC label shorthands, consistent with the runtime constants.

## Runtime Label Constants

The runtime defines four special DC labels in [dclabel.mts:217-227](rt/src/levels/DCLabels/dclabel.mts#L217-L227):

| Constant     | Confidentiality | Integrity  | Meaning                          |
|--------------|-----------------|------------|----------------------------------|
| `IFC_BOT`    | `CNF_TRUE`      | `CNF_FALSE`| Most public, least trusted       |
| `IFC_TOP`    | `CNF_FALSE`     | `CNF_TRUE` | Most secret, least trusted       |
| `TRUST_NULL` | `CNF_TRUE`      | `CNF_TRUE` | No restrictions (null trust)     |
| `TRUST_ROOT` | `CNF_FALSE`     | `CNF_FALSE`| Most secret, most trusted        |

Current runtime pretty-printing uses `#TOP` and `#ROOT` as shorthands (see [dcl_pp_config.mts:18-19](rt/src/levels/DCLabels/dcl_pp_config.mts#L18-L19)).

## Proposed Mapping

| Parser Shorthand | DC Label Expansion                         | Runtime Constant |
|------------------|--------------------------------------------|------------------|
| `` `#BOT` ``     | `<#null-confidentiality; #root-integrity>` | `IFC_BOT`        |
| `` `#TOP` ``     | `<#root-confidentiality; #null-integrity>` | `IFC_TOP`        |
| `` `#NULL` ``    | `<#null-confidentiality; #null-integrity>` | `TRUST_NULL`     |
| `` `#ROOT` ``    | `<#root-confidentiality; #root-integrity>` | `TRUST_ROOT`     |

Note: These labels use backtick delimiters like other label literals (e.g., `` `{}` ``).

---

## Required Changes

### 1. Lexer (`compiler/src/Lexer.x`)

Add four new tokens (around line 121, after existing DC label tokens):

```haskell
-- In state 0 (not inside DC label context)
<0>   "`#BOT`"                       { mkL TokenDCBot }
<0>   "`#TOP`"                       { mkL TokenDCTop }
<0>   "`#NULL`"                      { mkL TokenDCNull }
<0>   "`#ROOT`"                      { mkL TokenDCRoot }
```

Add token definitions (around line 280, after `TokenDCNullInteg`):

```haskell
  | TokenDCBot
  | TokenDCTop
  | TokenDCNull
  | TokenDCRoot
```

### 2. Parser (`compiler/src/Parser.y`)

Add token declarations (around line 89):

```haskell
    '#BOT'  { L _ TokenDCBot }
    '#TOP'  { L _ TokenDCTop }
    '#NULL' { L _ TokenDCNull }
    '#ROOT' { L _ TokenDCRoot }
```

Extend `Lit` production (around line 248, after the DC label literal rule):

```haskell
Lit:   NUM                        { LNumeric (NumInt (numTok $1)) (pos $1) }
     | FLOAT                       { LNumeric (NumFloat (floatTok $1)) (pos $1) }
     | STRING                      { LString (strTok $1) }
     | true                        { LBool True }
     | false                       { LBool False }
     | LABEL                       { LLabel (lblTok $1) }
     |'`<' DCLabelExp '>`'         { LDCLabel $2 }
     | '#BOT'                      { LDCLabel dcLabelBot }
     | '#TOP'                      { LDCLabel dcLabelTop }
     | '#NULL'                     { LDCLabel dcLabelNull }
     | '#ROOT'                     { LDCLabel dcLabelRoot }
```

### 3. DCLabels Module (`compiler/src/DCLabels.hs`)

Add helper constructors for the four special labels. Export them (around line 25):

```haskell
  , dcLabelBot
  , dcLabelTop
  , dcLabelNull
  , dcLabelRoot
```

Add definitions (at end of file):

```haskell
-- | IFC_BOT: <#null-conf; #root-intg> = most public, least trusted
dcLabelBot :: DCLabelExp
dcLabelBot = DCLabelExp (ConstComponent LabelTrue, ConstComponent LabelFalse)

-- | IFC_TOP: <#root-conf; #null-intg> = most secret, least trusted
dcLabelTop :: DCLabelExp
dcLabelTop = DCLabelExp (ConstComponent LabelFalse, ConstComponent LabelTrue)

-- | TRUST_NULL: <#null-conf; #null-intg> = no restrictions
dcLabelNull :: DCLabelExp
dcLabelNull = DCLabelExp (ConstComponent LabelTrue, ConstComponent LabelTrue)

-- | TRUST_ROOT: <#root-conf; #root-intg> = most secret, most trusted
dcLabelRoot :: DCLabelExp
dcLabelRoot = DCLabelExp (ConstComponent LabelFalse, ConstComponent LabelFalse)
```

### 4. Parser Import Update

In Parser.y, update the DCLabels import (if needed) to include the new constructors:

```haskell
import DCLabels
```

(Already imports the full module, so no change needed.)

---

## Testing

Create test file `tests/rt/pos/ifc/dc-label-shorthands.trp`:

```sml
(* Test DC label shorthand parsing *)
let
    val bot = `#BOT`
    val top = `#TOP`
    val null = `#NULL`
    val root = `#ROOT`

    val _ = print ("bot = ", bot)
    val _ = print ("top = ", top)
    val _ = print ("null = ", null)
    val _ = print ("root = ", root)

    (* Verify equivalence with expanded forms *)
    val _ = print ("bot == <#null-conf;#root-intg>? ", bot = `<#null-confidentiality; #root-integrity>`)
    val _ = print ("top == <#root-conf;#null-intg>? ", top = `<#root-confidentiality; #null-integrity>`)
    val _ = print ("null == <#null-conf;#null-intg>? ", null = `<#null-confidentiality; #null-integrity>`)
    val _ = print ("root == <#root-conf;#root-intg>? ", root = `<#root-confidentiality; #root-integrity>`)

    (* Verify V1 {} equivalence *)
    val _ = print ("bot == V1 {}? ", bot = `{}`)
in ()
end
```

---

## Build and Verification Steps

1. `make compiler` - Rebuild compiler
2. `make rt` - Rebuild runtime (not strictly necessary for this change)
3. `bin/troupec tests/rt/pos/ifc/dc-label-shorthands.trp` - Test parsing
4. `./local.sh tests/rt/pos/ifc/dc-label-shorthands.trp` - Verify runtime execution
5. `bin/golden` - Run full test suite

---

## Alternative Design Considerations

### Case Sensitivity
The proposed design uses uppercase `#BOT`, `#TOP`, `#NULL`, `#ROOT` to match runtime pretty-printing. Could also support lowercase variants.

### Without Backticks
Could alternatively support `#BOT` without backticks (like `#true`/`#false`), but this would be inconsistent with other label literals which all use backticks.

### Shorthand Naming
Alternative names considered:
- `#BOTTOM` / `#BOT` - Both reasonable
- `#EMPTY` for `#NULL` - Less clear semantically
- `#FLOOR` / `#CEILING` - More confusing than `#BOT` / `#TOP`

The proposed names (`#BOT`, `#TOP`, `#NULL`, `#ROOT`) align with existing codebase naming conventions.
