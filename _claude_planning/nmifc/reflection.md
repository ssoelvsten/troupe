In this task we want to add support for reflection operation to DCLabels.

The idea behind reflection is that given a label <c,i>, the reflection of
that label is <i,c>.

We then want to add a notion of label being corrupt as follows: a label 𝓁
is corrupt if it is not the case that 𝓁 flows to reflection ( 𝓁 ) .

## Implementation

Added to `rt/src/levels/DCLabels/dclabel.mts`:
- `reflection(): DCLabel` - returns `<I, S>` for a label `<S, I>`
- `isCorrupt(): boolean` - returns `true` iff `I ⟹ S` is false (simplified from `!this.flowsTo(this.reflection())`)

## Experiments

Experiment file: `rt/src/_experiments/test-reflection.mts`


### Results

| Label | Representation | Reflection | Corrupt? |
|-------|----------------|------------|----------|
| IFC_BOT | `{}` | `{#TOP}` | No |
| IFC_TOP | `{#TOP}` | `{}` | **Yes** |
| TRUST_NULL | `<True; True>` | same | No |
| TRUST_ROOT | `{#ROOT}` | same | No |
| `alice` | `{alice}` | same | No |
| `alice ⊔ bob` | `{alice,bob}` | `<alice\|bob;alice&bob>` | **Yes** |

### Observations

1. **Core labels**: Only IFC_TOP is corrupt. The others either have symmetric
   components (TRUST_NULL, TRUST_ROOT) or are at the bottom of the lattice.

2. **Single tag `alice`**: Not corrupt. Since `fromSingleTag` creates a label
   with identical confidentiality and integrity (`<alice; alice>`), the
   reflection equals itself.

3. **Join of `alice` and `bob`**: Corrupt! The join creates:
   - Confidentiality: `alice ∧ bob`
   - Integrity: `alice ∨ bob`

   The reflection swaps these. For flow, we need:
   - `(alice ∨ bob) ⟹ (alice ∧ bob)` — FALSE
   - `(alice ∨ bob) ⟹ (alice ∧ bob)` — FALSE

   Disjunction does not imply conjunction, so the join is corrupt.

### Downgrade behavior with corrupt labels

Current IFC allows downgrading corrupt labels if authority is sufficient:

| Operation | From | To | Corrupt? | Result |
|-----------|------|----|---------:|--------|
| Declassify | `{alice,bob}` | `{}` | yes → no | FAIL (integrity mismatch) |
| Endorse | `{alice,bob}` | `{#ROOT}` | yes → no | FAIL (confidentiality mismatch) |
| Declassify | `{alice,bob}` | `<True; alice\|bob>` | yes → no | **SUCCESS** |
| Endorse | `{alice,bob}` | `<alice&bob; False>` | yes → no | **SUCCESS** |

The last two succeed because they preserve the required dimension while changing
the other.

## NMIFC Implementation

Added proper NMIFC checks to `okToDowngradeGeneric` in `dclabel.mts`:

- New optional parameter: `pc: DCLabel = TRUST_NULL`
- New error reasons in `DowngradeEnums.mts`: `ROBUSTNESS_VIOLATION`, `TRANSPARENCY_VIOLATION`

### Robust Declassification (Definition 5 from security model)

For declassification from ⟨S_from, I_from⟩ to ⟨S_to, I_to⟩ with pc = ⟨S_pc, I_pc⟩:

1. I_to = I_from (integrity unchanged) — already enforced
2. **(S_auth ∨ I_from ∨ I_pc) ∧ S_to ⟹ S_from**

The key insight: the integrity of the data (`I_from`) and the PC (`I_pc`) limit what
can be declassified. If the context is untrusted (low `I_pc`), declassification is
restricted to prevent attackers from influencing what gets released.

### Transparent Endorsement (Definition 6 from security model)

For endorsement from ⟨S_from, I_from⟩ to ⟨S_to, I_to⟩ with pc = ⟨S_pc, I_pc⟩:

1. S_to = S_from (confidentiality unchanged) — already enforced
2. **I_from ⟹ I_to ∨ (S_from ∧ S_pc)**
3. I_auth ∧ I_from ⟹ I_to — already enforced by authority check

The key insight: the confidentiality of the data (`S_from`) and PC (`S_pc`) limit
endorsement. Public code (high `S_pc`) cannot covertly endorse secret data.

### Test Results

| Test | isNMIFC | PC | Result |
|------|---------|-----|--------|
| Declassify {alice} → public | true | BOT | SUCCESS |
| Declassify {alice} → public | true | NULL | **ROBUSTNESS_VIOLATION** |
| Endorse public untrusted → trusted | true | BOT | SUCCESS |
| Endorse secret untrusted → trusted | true | BOT | **TRANSPARENCY_VIOLATION** |

## Key Finding: Corruption ⟺ NMIFC Failure (under PC=BOT, ROOT authority)

With PC = BOT (high integrity) and ROOT authority, NMIFC checks simplify to:

- **Robustness**: `(S_auth ∨ I_from ∨ I_pc) ∧ S_to ⟹ S_from` → `I_from ⟹ S_from`
- **Transparency**: `I_from ⟹ I_to ∨ (S_from ∧ S_pc)` → `I_from ⟹ S_from`

Both reduce to `I ⟹ S`, which is exactly the non-corruption condition!

**Theorem**: Under PC=BOT and ROOT authority, for any "real" downgrade (where authority
is actually needed), NMIFC succeeds iff the source label is not corrupt.

This was verified experimentally across multiple label types (see test section 7).
