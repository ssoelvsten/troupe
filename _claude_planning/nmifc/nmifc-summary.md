# NMIFC Implementation Summary

This document summarizes the implementation of Non-Malleable Information Flow Control (NMIFC) checks in the Troupe runtime.

## Background

NMIFC extends standard IFC with two key properties:

1. **Robust Declassification**: Untrusted code cannot influence what information gets declassified
2. **Transparent Endorsement**: Public code cannot covertly boost the integrity of secret data

## Implementation

### Files Modified

| File                                   | Changes                                                                      |
|----------------------------------------|------------------------------------------------------------------------------|
| `rt/src/levels/DCLabels/dclabel.mts`   | Added `reflection()`, `isCorrupt()`, NMIFC checks in `okToDowngradeGeneric`  |
| `rt/src/DowngradeEnums.mts`            | Added `ROBUSTNESS_VIOLATION`, `TRANSPARENCY_VIOLATION` error reasons         |
| `rt/src/DowngradeFormatter.mts`        | Added formatters for new error types                                         |
| `rt/src/downgrading.mts`               | Updated to pass PC label and handle new errors                               |
| `rt/src/Level.mts`                     | Updated signatures to accept optional PC parameter                           |

### New DCLabel Methods

```typescript
// Returns <I, S> for a label <S, I>
reflection(): DCLabel {
    return new DCLabel(this.integrity, this.confidentiality);
}

// A label <S, I> is corrupt iff I ⟹ S is false
isCorrupt(): boolean {
    return !implies(this.integrity, this.confidentiality);
}
```

### NMIFC Check Signatures

```typescript
okToDeclassify(from, to, auth, bl, isNMIFC, pc?): DowngradeResult
okToEndorse(from, to, auth, bl, isNMIFC, pc?): DowngradeResult
```

When `isNMIFC = true`, additional checks are performed based on the PC label.

## NMIFC Semantics (DC Labels)

From the Troupe security model document (Section 2.3):

### Robust Declassification (Definition 5)

For declassification from `<S_from, I_from>` to `<S_to, I_to>` with authority `<S_auth, I_auth>` and PC `<S_pc, I_pc>`:

1. `I_to = I_from` (integrity unchanged)
2. `(S_auth ∨ I_from ∨ I_pc) ∧ S_to ⟹ S_from`

### Transparent Endorsement (Definition 6)

For endorsement from `<S_from, I_from>` to `<S_to, I_to>` with authority `<S_auth, I_auth>` and PC `<S_pc, I_pc>`:

1. `S_to = S_from` (confidentiality unchanged)
2. `I_from ⟹ I_to ∨ (S_from ∧ S_pc)`
3. `I_auth ∧ I_from ⟹ I_to` (already enforced by standard authority check)

## Label Corruption

A label `<S, I>` is **corrupt** if it does not flow to its reflection `<I, S>`.

This simplifies to: a label is corrupt iff `I ⟹ S` is **false**.

### Examples

| Label            | S         | I         | I ⟹ S?                  | Corrupt? |
|------------------|-----------|-----------|-------------------------|----------|
| `{alice}`        | alice     | alice     | yes                     | no       |
| `<TRUE; alice>`  | TRUE      | alice     | yes (alice ⟹ TRUE)      | no       |
| `<alice; TRUE>`  | alice     | TRUE      | no (TRUE ⟹ alice fails) | **yes**  |
| `<alice; bob>`   | alice     | bob       | no                      | **yes**  |
| `{alice,bob}`    | alice∧bob | alice∨bob | no                      | **yes**  |
| `IFC_TOP`        | FALSE     | TRUE      | no                      | **yes**  |
| `TRUST_NULL`     | TRUE      | TRUE      | yes                     | no       |
| `IFC_BOT`        | TRUE      | FALSE     | yes (FALSE ⟹ TRUE)      | no       |

## Key Theorem

**Under PC = BOT (high integrity) and ROOT authority, NMIFC succeeds iff the source label is NOT corrupt.**

### Proof Sketch

With `S_auth = FALSE` (ROOT), `I_pc = FALSE` (BOT), and full downgrade targets:

**Robustness** (with `S_to = TRUE`):
```
(S_auth ∨ I_from ∨ I_pc) ∧ S_to ⟹ S_from
= (FALSE ∨ I_from ∨ FALSE) ∧ TRUE ⟹ S_from
= I_from ⟹ S_from
```

**Transparency** (with `I_to = FALSE`):
```
I_from ⟹ I_to ∨ (S_from ∧ S_pc)
= I_from ⟹ FALSE ∨ (S_from ∧ TRUE)
= I_from ⟹ S_from
```

Both reduce to `I ⟹ S`, which is exactly the non-corruption condition.

### Experimental Verification

| Label            | Corrupt? | Decl NMIFC | End NMIFC | Hypothesis |
|------------------|----------|------------|-----------|------------|
| `{alice}`        | no       | ✓          | ✓         | ✓          |
| `<alice; bob>`   | yes      | ✗          | ✗         | ✓          |
| `<bob; alice>`   | yes      | ✗          | ✗         | ✓          |
| `{alice,bob}`    | yes      | ✗          | ✗         | ✓          |
| `<alice; TRUE>`  | yes      | ✗          | ✗         | ✓          |
| `<TRUE; alice>`  | no       | N/A        | ✓         | ✓          |
| `IFC_TOP`        | yes      | ✗          | ✗         | ✓          |
| `TRUST_NULL`     | no       | N/A        | ✓         | ✓          |

## Running the Tests

```bash
cd rt
npx tsx src/_experiments/test-reflection.mts
```

## Implications

1. **Symmetric labels** (where `S = I`, like `{alice}`) are never corrupt and always pass NMIFC checks with sufficient authority.

2. **Joins create corruption**: `{alice} ⊔ {bob} = {alice,bob}` has `S = alice∧bob` but `I = alice∨bob`, making it corrupt.

3. **Low-integrity PC weakens robustness**: With `PC = TRUST_NULL`, even non-corrupt labels may fail robustness checks because the attacker-controlled context can influence declassification.

4. **High-confidentiality data limits endorsement**: Secret untrusted data cannot be endorsed by public code, preventing covert integrity boosting.

## Trust Anchor Pattern

Joins create corruption, but this can be avoided using a **trust anchor** - a shared symmetric label that parties meet with before joining.

### The Problem

```
{alice} ⊔ {bob} = <alice ∧ bob; alice ∨ bob>  → CORRUPT (I ⟹ S fails)
```

### The Solution

Given a trust anchor `t' = <t, t>`:

```
a_2 = {alice} ⊓ {trust} = <alice ∨ t; alice ∧ t>
b_2 = {bob} ⊓ {trust} = <bob ∨ t; bob ∧ t>

a_2 ⊔ b_2 = <(alice ∧ bob) ∨ t; (alice ∨ bob) ∧ t>  → NOT CORRUPT
```

The `t` component ensures `I ⟹ S` holds: `(alice ∨ bob) ∧ t ⟹ t ⟹ (alice ∧ bob) ∨ t`

### Downgrade Path

To reach `a ⊓ t'` from `a`, two operations are needed (in either order):

| Order | Step 1              | Step 2              | `{trust}` | `{alice}` |
|-------|---------------------|---------------------|-----------|-----------|
| A     | Endorse (add `t`)   | Declassify (add `t`)| Step 1    | Step 2    |
| B     | Declassify (add `t`)| Endorse (add `t`)   | Step 2    | Step 1    |

**Key insight**: Both orders require **cooperative authority** (`{trust}` + `{alice}`). Neither party can perform the transformation alone.

See `trust-dg.md` for detailed analysis.

## Future Work

- Integrate NMIFC enforcement into actual runtime downgrade operations (currently `isNMIFC` defaults to `false`)
- Extend NMIFC checks to blocking level and mailbox downgrades
- Consider whether NMIFC should be enabled by default
- Explore trust anchor patterns for multinode coordination
