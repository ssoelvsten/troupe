# StringExt Library Design

## Problem Statement

The Html library contains general-purpose string functions that should be in a shared library:
- `startsWith` - used for URL scheme checking
- `toLowerCase` - used for case-insensitive comparison
- `toLowerChar` - character case conversion

These functions are useful beyond HTML generation and duplicate logic that might exist elsewhere.

---

## API Design

### Prefix/Suffix Operations

```sml
(* Check if string starts with given prefix *)
fun startsWith prefix s : bool

(* Check if string ends with given suffix *)
fun endsWith suffix s : bool

(* Case-insensitive versions - more efficient than lowercasing entire string *)
fun startsWithIgnoreCase prefix s : bool
fun endsWithIgnoreCase suffix s : bool

(* Remove prefix if present *)
fun stripPrefix prefix s : string option

(* Remove suffix if present *)
fun stripSuffix suffix s : string option
```

### Case Conversion

```sml
(* Convert string to lowercase (ASCII only) *)
fun toLowerCase s : string

(* Convert string to uppercase (ASCII only) *)
fun toUpperCase s : string

(* Capitalize first character *)
fun capitalize s : string
```

### Trimming

```sml
(* Remove leading and trailing whitespace *)
fun trim s : string

(* Remove leading whitespace *)
fun trimLeft s : string

(* Remove trailing whitespace *)
fun trimRight s : string

(* Remove specific characters from both ends *)
fun trimChars chars s : string
```

### Searching

```sml
(* Find first occurrence of needle in haystack, returns index or -1 *)
fun indexOf needle haystack : int

(* Find last occurrence *)
fun lastIndexOf needle haystack : int

(* Check if needle is in haystack *)
fun contains needle haystack : bool

(* Count occurrences *)
fun count needle haystack : int
```

### Replacement

```sml
(* Replace first occurrence *)
fun replace old new s : string

(* Replace all occurrences *)
fun replaceAll old new s : string
```

### Splitting

```sml
(* Split string by delimiter *)
fun split delimiter s : string list

(* Split into at most n parts *)
fun splitN n delimiter s : string list

(* Split at specific index *)
fun splitAt index s : string * string

(* Split into lines *)
fun lines s : string list

(* Split into words (whitespace-separated) *)
fun words s : string list
```

### Predicates

```sml
(* Check if string is empty *)
fun isEmpty s : bool

(* Check if string is whitespace only *)
fun isBlank s : bool

(* Check if all characters satisfy predicate *)
fun all pred s : bool

(* Check if any character satisfies predicate *)
fun any pred s : bool
```

---

## Implementation Notes

### Efficient `startsWithIgnoreCase`

The current Html implementation does:
```sml
fun isDangerousUrl url =
    let val lower = toLowerCase url  (* O(n) - converts ENTIRE URL *)
    in startsWith "javascript:" lower
```

Better approach:
```sml
fun startsWithIgnoreCase prefix s =
    let val prefixLen = String.size prefix
        val sLen = String.size s
        fun charsEqIgnoreCase i =
            if i >= prefixLen then true
            else let val pc = String.subCode(prefix, i)
                     val sc = String.subCode(s, i)
                     val pcLower = if pc >= 65 andalso pc <= 90 then pc + 32 else pc
                     val scLower = if sc >= 65 andalso sc <= 90 then sc + 32 else sc
                 in pcLower = scLower andalso charsEqIgnoreCase (i + 1)
                 end
    in sLen >= prefixLen andalso charsEqIgnoreCase 0
    end
```

This is **O(prefix length)** instead of **O(string length)**.

### Dependencies

- Requires `String.trp` (already exists)
- Optional: `Char.trp` for cleaner character operations

---

## Functions to Move from Html.trp

After StringExt is created, Html should:

1. Import StringExt
2. Remove local definitions of:
   - `startsWith`
   - `toLowerChar`
   - `toLowerCase`
3. Use `StringExt.startsWithIgnoreCase` for URL checking (more efficient)

---

## Test Cases

```sml
(* startsWith *)
test "startsWith basic" (StringExt.startsWith "hello" "hello world") true
test "startsWith empty prefix" (StringExt.startsWith "" "hello") true
test "startsWith empty string" (StringExt.startsWith "hello" "") false
test "startsWith exact" (StringExt.startsWith "hello" "hello") true

(* startsWithIgnoreCase *)
test "startsWithIgnoreCase" (StringExt.startsWithIgnoreCase "HELLO" "hello world") true
test "startsWithIgnoreCase javascript" (StringExt.startsWithIgnoreCase "javascript:" "JAVASCRIPT:alert(1)") true

(* toLowerCase *)
test "toLowerCase" (StringExt.toLowerCase "Hello World") "hello world"
test "toLowerCase empty" (StringExt.toLowerCase "") ""
test "toLowerCase numbers" (StringExt.toLowerCase "ABC123") "abc123"

(* trim *)
test "trim" (StringExt.trim "  hello  ") "hello"
test "trim empty" (StringExt.trim "   ") ""

(* split *)
test "split" (StringExt.split "," "a,b,c") ["a", "b", "c"]
test "split empty" (StringExt.split "," "") [""]
test "split no match" (StringExt.split "," "abc") ["abc"]

(* contains *)
test "contains" (StringExt.contains "world" "hello world") true
test "contains not" (StringExt.contains "foo" "hello world") false
```

---

## Files to Create

1. `lib/StringExt.trp` - The library implementation
2. `tests/lib/StringExt.trp` - Unit tests
