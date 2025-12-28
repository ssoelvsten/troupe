To add support for NMIFC in Troupe, we will proceed as follows.

# cross-dimensional downgrading

1. We will create a set of primitives for cross-dimensional downgrading

- `downgrade`, for general downgrading of values
- `blockdownto`, for general downgrading of the blocking level (that
- `blockdown`, for downgrading to the current pc label
  takes the target label just like `blockdeclto`)
- an appropirately named primitives for downgrading mailbox clearances

2. We will parameterize the system based on whether it is running in the
   NMIFC-enforcing mode or not.

This needs to be added to Troupe CLI as a flag; in the future, by
defalut we will make it that nmifc is enforced, and there will be a
special flag, something like `disable-nmifc` (or something appropriate
based on the CLI library we are using) that will turn it off. 

3. (optional stretch goal): disable downgrading with root authority

We may want to consider adding one more default to the system, which is
means that the authority for downgrading must be appropriately
that by default root authority cannot be used for downgrading, which
attenuated.

This will break many existing tests, and we will therefore need to be
careful with rolling this out.

something like, `allow-root-authority-downgrades` For existing tests, we
We should also extend Troupe CLI to disable this, by adding a flag,
will need to either 1) add option configuration

that will inform the test engine to allow root authority downgrades or
2) rewrite them to use the attenuated authority.

4. We will keep the single-dimensional separate primitives for
declassification and endorsement, both for backwards compatibility and
also for helping people make better sense of their code. 

5. We will create a standard library function (maybe in a new module
called nmifc) for assisted nmifc downgrading that will have the form of
`nmifc-dc (f, a, b, t, ...)` where f is function of two arguments that
computes on untrusted data, and `a` and `b` correspond to arguments that
are at mutually distrustful levels, `t` is the trusted label, and then
the rest of the arguments include the other necessary ingredients, e.g.,
the necessary authority (and/or levels), etc. We may want to iterate
over the exact signature of this function, e.g., use records if we say
an emerging pattern for better usability. The crux of this is that this
library function will perform the necessary combination of preventive
downgrading using the trust anchoring pattern described in
`nmifc-summary.md` and `trust-dg.md` on the information `a` and `b` and
return the result of running that function that should be flowing to
`t`. 

