# Html Library Analysis: Code Smells, Performance, and Library Design

## 1. Code Smells and Issues

### 1.1 Functions That Don't Belong in Html.trp

The following functions are **general-purpose utilities** that were added specifically for HTML security but have broader applicability:

| Function | Lines | Issue | Should Move To |
|----------|-------|-------|----------------|
| `startsWith` | 17-23 | Generic string operation | `String.trp` |
| `toLowerChar` | 25-35 | Character conversion | New `Char.trp` |
| `toLowerCase` | 37-38 | String case conversion | `String.trp` |
| `isDangerousUrl` | 40-46 | URL validation | New `Url.trp` |
| `sanitizeUrl` | 48-49 | URL sanitization | New `Url.trp` |
| `urlAttrs` | 52 | URL attribute list | New `Url.trp` |
| `isUrlAttr` | 55 | Attribute classification | New `Url.trp` |

### 1.2 Architectural Issues

1. **No separation of concerns**: Security logic (escaping, URL validation) is mixed with HTML generation
2. **Hardcoded URL attribute list**: Should be configurable or in a dedicated module
3. **String-based type dispatch**: Using `"Element"`, `"Text"` strings instead of proper variant types

### 1.3 Missing Functionality

1. No `fromCharCode` function to create characters from ASCII codes
2. No efficient string builder for large documents
3. No streaming/incremental rendering option

---

## 2. Performance Analysis

### 2.1 Current Performance Bottlenecks

#### Problem 1: `explode` Creates O(n) Intermediate Objects

Every string operation uses `String.explode`:
```sml
fun explode s = let fun go 0 acc = acc
                      | go i acc = go (i-1) ((sub (s,i-1))::acc)
                in go (size s) [] end
```

For a 1000-character string:
- Creates 1000 list cells
- Creates 1000 single-character strings
- Poor memory locality

#### Problem 2: `toLowerCase` Converts Entire String

```sml
fun isDangerousUrl url =
    let val lower = toLowerCase url  (* Converts ENTIRE URL *)
    in startsWith "javascript:" lower ...
```

To check if URL starts with `"javascript:"` (11 chars), we lowercase potentially thousands of characters.

**Complexity**: O(n) where n = URL length, but we only need O(11)

#### Problem 3: Multiple Passes in Escaping

`escapeHtml` does:
1. `explode` - O(n) pass creating list
2. `List.map escapeBase` - O(n) pass
3. `concat` - O(n) pass joining strings

**Total: 3 passes over data**

#### Problem 4: String Concatenation in `render`

```sml
"<" ^ name ^ attrs ^ ">" ^ children ^ "</" ^ name ^ ">"
```

Each `^` allocates a new string. For a deeply nested document with 1000 elements:
- ~7000 intermediate string allocations
- Each allocation copies all previous content

**Complexity**: O(n * d) where n = total size, d = depth

#### Problem 5: `isUrlAttr` Linear Search

```sml
fun isUrlAttr name = List.elem name urlAttrs  (* 8 elements *)
```

Called for **every attribute** in **every element**. For a document with 500 elements averaging 3 attributes each:
- 1500 calls to `isUrlAttr`
- Each call searches up to 8 elements
- Up to 12,000 string comparisons

### 2.2 Complexity Summary

| Operation | Current | Optimal | Issue |
|-----------|---------|---------|-------|
| `escapeHtml` | O(3n) | O(n) | 3 passes |
| `toLowerCase` | O(n) | O(1) for prefix check | Over-processing |
| `isUrlAttr` | O(k) per call | O(1) | Linear search |
| `render` (single) | O(m) | O(m) | 7 allocations per element |
| `render` (nested) | O(n*d) | O(n) | Repeated copying |

Where n = string length, k = 8 (URL attrs), m = element size, d = nesting depth

---

## 3. Proposed New Libraries

### 3.1 `Char.trp` - Character Utilities

**Purpose**: Character classification and conversion functions

```sml
(* Character classification *)
fun isUpper c    (* A-Z *)
fun isLower c    (* a-z *)
fun isDigit c    (* 0-9 *)
fun isAlpha c    (* A-Z, a-z *)
fun isAlnum c    (* A-Z, a-z, 0-9 *)
fun isSpace c    (* whitespace *)
fun isAscii c    (* 0-127 *)

(* Character conversion *)
fun toUpper c
fun toLower c
fun toCode c     (* char -> int, already exists as String.subCode *)
fun fromCode n   (* int -> char, NEEDS RUNTIME SUPPORT *)

(* Character comparison *)
fun eqIgnoreCase c1 c2
```

**Blocked by**: Need `fromCharCode` runtime primitive

### 3.2 `StringExt.trp` - Extended String Operations

**Purpose**: Common string operations missing from String.trp

```sml
(* Prefix/Suffix *)
fun startsWith prefix s
fun endsWith suffix s
fun startsWithIgnoreCase prefix s  (* EFFICIENT: no full lowercase *)
fun endsWithIgnoreCase suffix s

(* Case conversion *)
fun toLowerCase s
fun toUpperCase s

(* Trimming *)
fun trim s
fun trimLeft s
fun trimRight s

(* Search *)
fun indexOf needle haystack
fun lastIndexOf needle haystack
fun contains needle haystack

(* Replacement *)
fun replace old new s        (* first occurrence *)
fun replaceAll old new s     (* all occurrences *)

(* Splitting/Joining *)
fun split delimiter s        (* string -> string list *)
fun splitAt index s          (* string -> string * string *)
```

### 3.3 `StringBuilder.trp` - Efficient String Building (CRITICAL)

**Purpose**: Build large strings efficiently without O(n*d) concatenation

```sml
(* Builder type - represents a string being constructed *)
datatype builder = Empty
                 | Leaf of string
                 | Concat of builder * builder

(* Construction *)
val empty : builder
fun singleton s : builder
fun append b1 b2 : builder      (* O(1) - just creates node *)
fun appendString b s : builder  (* O(1) *)

(* List operations *)
fun fromList strings : builder  (* O(k) where k = list length *)
fun concatBuilders builders : builder

(* Finalization *)
fun build b : string            (* O(n) - single pass *)
fun size b : int                (* O(tree height) or cached O(1) *)

(* Direct building *)
fun surround prefix suffix b : builder  (* O(1) *)
```

**Why This Matters**:

Current `render`:
```sml
"<" ^ name ^ attrs ^ ">" ^ children ^ "</" ^ name ^ ">"
(* 7 allocations, each copying accumulated content *)
```

With StringBuilder:
```sml
build (fromList ["<", name, attrs, ">", children, "</", name, ">"])
(* 1 allocation at the end *)
```

### 3.4 `Url.trp` - URL Handling

**Purpose**: URL parsing, validation, and sanitization

```sml
(* URL record type *)
type url = { scheme: string
           , host: string option
           , port: int option
           , path: string
           , query: string option
           , fragment: string option
           }

(* Parsing *)
fun parse urlString : url option

(* Validation *)
fun isValid url : bool
fun isDangerousScheme scheme : bool
fun hasDangerousScheme urlString : bool  (* Efficient: only checks prefix *)

(* Sanitization *)
fun sanitize urlString : string

(* Encoding *)
fun encode s : string      (* URL-encode special chars *)
fun decode s : string      (* URL-decode %XX sequences *)

(* URL attribute handling *)
val urlAttributes : string list
fun isUrlAttribute name : bool
```

---

## 4. Priority and Dependencies

```
                    ┌─────────────────┐
                    │ fromCharCode    │ (Runtime primitive)
                    │ primitive       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    Char.trp     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌────────▼────────┐   ┌───────▼───────┐
│ StringExt.trp │   │ StringBuilder   │   │   Url.trp     │
└───────┬───────┘   └────────┬────────┘   └───────┬───────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────▼────────┐
                    │    Html.trp     │ (refactored)
                    └─────────────────┘
```

| Library | Priority | Blocked By | Benefit |
|---------|----------|------------|---------|
| StringBuilder | P0 | None | Major perf improvement |
| StringExt | P1 | None (Char optional) | Code reuse, cleaner Html |
| Char | P2 | `fromCharCode` primitive | Enables full StringExt |
| Url | P3 | StringExt (optional) | Cleaner security code |

---

## 5. Recommended Implementation Order

### Phase 1: StringBuilder (No Dependencies)
- Implement rope/builder pattern
- Refactor Html.render to use it
- Benchmark before/after

### Phase 2: StringExt (Partial)
- Implement `startsWith`, `endsWith`, `startsWithIgnoreCase`
- Move `toLowerCase` from Html (current impl)
- Html imports StringExt

### Phase 3: Char Library
- Add `fromCharCode` runtime primitive
- Implement full Char library
- Optimize StringExt with Char functions

### Phase 4: Url Library
- Move URL logic from Html
- Add proper URL parsing
- Html imports Url for sanitization

---

## 6. Files to Create

1. `lib/StringBuilder.trp` - String builder library
2. `lib/StringExt.trp` - Extended string operations
3. `lib/Char.trp` - Character utilities (after runtime support)
4. `lib/Url.trp` - URL handling

---

## 7. Benchmarks Needed

See `benchmark_html_perf.trp` for:
1. Large document rendering (1000 elements)
2. Deep nesting (100 levels)
3. Large text content escaping (10KB strings)
4. URL validation on many attributes

These benchmarks will justify the StringBuilder library by showing the performance difference.
