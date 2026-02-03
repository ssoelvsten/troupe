# Trust Downgrading via Meet Operation

Read `_claude_planning/nmifc/nmifc-summary.md` for background on NMIFC and label corruption.

## Problem: Joins Create Corruption

When joining two symmetric labels, the result is typically corrupt:

```
{alice} ⊔ {bob} = <alice ∧ bob; alice ∨ bob>
```

This is corrupt because `I ⟹ S` fails: `alice ∨ bob ⟹ alice ∧ bob` is false.

## Question: Can Meet with a Trust Anchor Prevent Corruption?

Suppose we have:
- `a_1 = <a, a>` and `b_1 = <b, b>` (symmetric labels)
- `t' = <t, t>` (a trust anchor label)

We compute:
- `a_2 = a_1 ⊓ t'`
- `b_2 = b_1 ⊓ t'`

**Is `a_2 ⊔ b_2` corrupt?**

## Analysis

### DC Label Operations

For DC labels:
- **meet (⊓)**: `<S1, I1> ⊓ <S2, I2> = <S1 ∨ S2, I1 ∧ I2>`
- **join (⊔)**: `<S1, I1> ⊔ <S2, I2> = <S1 ∧ S2, I1 ∨ I2>`

### Step 1: Compute a_2 and b_2

```
a_2 = <a, a> ⊓ <t, t> = <a ∨ t, a ∧ t>
b_2 = <b, b> ⊓ <t, t> = <b ∨ t, b ∧ t>
```

### Step 2: Compute the join

```
a_2 ⊔ b_2 = <(a ∨ t) ∧ (b ∨ t), (a ∧ t) ∨ (b ∧ t)>
```

Using distributive laws:
- `(a ∨ t) ∧ (b ∨ t) = (a ∧ b) ∨ t`
- `(a ∧ t) ∨ (b ∧ t) = (a ∨ b) ∧ t`

So:
```
a_2 ⊔ b_2 = <(a ∧ b) ∨ t, (a ∨ b) ∧ t>
```

### Step 3: Check Corruption

A label `<S, I>` is corrupt iff `I ⟹ S` is false.

Here:
- `S = (a ∧ b) ∨ t`
- `I = (a ∨ b) ∧ t`

We need to check: `(a ∨ b) ∧ t ⟹ (a ∧ b) ∨ t`

**Key insight**: `(a ∨ b) ∧ t ⟹ t` (trivially), and `t ⟹ (a ∧ b) ∨ t` (trivially).

Therefore: **`I ⟹ S` holds!**

## Result

**The label `a_2 ⊔ b_2` is NOT corrupt.**

The trust anchor `t'` acts as a "trust bridge" - by meeting with `t'` before joining, the `t` component dominates and preserves non-corruption.

### Comparison

| Operation                          | Result Label                      | Corrupt? |
|------------------------------------|-----------------------------------|----------|
| `a_1 ⊔ b_1` (direct join)          | `<a ∧ b; a ∨ b>`                  | **Yes**  |
| `(a_1 ⊓ t') ⊔ (b_1 ⊓ t')` (anchored) | `<(a ∧ b) ∨ t; (a ∨ b) ∧ t>`    | **No**   |

## Implications

1. **Trust anchors can enable NMIFC-safe joins**: If parties agree on a common trust label `t`, their data can be joined without creating corruption.

2. **The anchor must be symmetric**: `t' = <t, t>` ensures the anchor itself is not corrupt.

3. **Meet before join pattern**: `(a ⊓ t) ⊔ (b ⊓ t)` preserves non-corruption when `a`, `b`, and `t` are symmetric.

4. **Practical application**: In a multinode system, a shared trust authority (like a coordinator node) could provide the trust anchor that allows data from different sources to be safely combined.

## Downgrade Path: Can We Reach `a_1 ⊓ t'` from `a_1`?

To use the trust anchor pattern, we need to downgrade from `a_1 = <a, a>` to `a_1 ⊓ t' = <a ∨ t, a ∧ t>`.

This changes both components:
- **Confidentiality**: `a` → `a ∨ t` (declassification)
- **Integrity**: `a` → `a ∧ t` (endorsement)

Since Troupe separates these operations, we need two steps:

### Step 1: Endorse `<a, a>` → `<a, a ∧ t>`

| Authority | Result | Why |
|-----------|--------|-----|
| ROOT      | ✓      | Full authority |
| `{trust}` | ✓      | `I_auth ∧ I_from ⟹ I_to` → `t ∧ a ⟹ a ∧ t` ✓ |
| `{alice}` | ✗      | `a ∧ a ⟹ a ∧ t` requires `a ⟹ t` |

### Step 2: Declassify `<a, a ∧ t>` → `<a ∨ t, a ∧ t>`

The intermediate label `<a, a ∧ t>` is **not corrupt** (since `a ∧ t ⟹ a`).

| Authority | Result | Why |
|-----------|--------|-----|
| ROOT      | ✓      | Full authority |
| `{trust}` | ✗      | `S_auth ∧ S_to ⟹ S_from` → `t ∧ (a ∨ t) ⟹ a` → `t ⟹ a` ✗ |
| `{alice}` | ✓      | `a ∧ (a ∨ t) ⟹ a` → `a ⟹ a` ✓ |

## Alternative Order: Declassify First, Then Endorse

### Step 1: Declassify `<a, a>` → `<a ∨ t, a>`

| Authority | Result | Why |
|-----------|--------|-----|
| ROOT      | ✓      | Full authority |
| `{trust}` | ✗      | `t ∧ (a ∨ t) ⟹ a` → `t ⟹ a` ✗ |
| `{alice}` | ✓      | `a ∧ (a ∨ t) ⟹ a` → `a ⟹ a` ✓ |

### Step 2: Endorse `<a ∨ t, a>` → `<a ∨ t, a ∧ t>`

The intermediate label `<a ∨ t, a>` is **not corrupt** (since `a ⟹ a ∨ t`).

| Authority | Result | Why |
|-----------|--------|-----|
| ROOT      | ✓      | Full authority |
| `{trust}` | ✓      | `t ∧ a ⟹ a ∧ t` ✓ |
| `{alice}` | ✗      | `a ∧ a ⟹ a ∧ t` requires `a ⟹ t` ✗ |

## Authority Requirements (Both Orders)

| Order | Step 1 | Step 2 | `{trust}` does | `{alice}` does |
|-------|--------|--------|----------------|----------------|
| A     | Endorse | Declassify | Step 1 | Step 2 |
| B     | Declassify | Endorse | Step 2 | Step 1 |

Both orders require the same combined authority: **`{trust}` + `{alice}`**

| Authority Combination | Overall |
|-----------------------|---------|
| ROOT                  | ✓       |
| `{trust}` only        | ✗       |
| `{alice}` only        | ✗       |
| `{trust}` + `{alice}` | ✓       |

**Key insight**: The trust anchor pattern requires **cooperative authority** - both the trust provider (`t`) and the data owner (`a`) must participate. The order doesn't matter.

This makes sense from a security perspective:
- The trust provider vouches for the integrity (`t` endorses)
- The data owner consents to reduced confidentiality (`a` declassifies)

## Running the Test

```bash
cd rt
npx tsx src/_experiments/test-reflection.mts
```

See Section 8 in the test output for verification of this analysis.
