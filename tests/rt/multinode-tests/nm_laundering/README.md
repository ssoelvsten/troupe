# Nonmalleability Laundering Example

In Cecchetti et al.'s CCS'17 paper on *Nonmalleable Information Flow*, they note how the following
code can break

```java
while(true) {
  int<T> x = 0 | x = 1; // Generate secret probablistically
  send(H, x);
  int<T→> y = receive(H);
  send(L, x ^ (y % 2) to L);
}
```

Similar to the [password](../nm_password/README.md) and [auction](../nm_auction/README.md) examples,
the problem is in the endorsement of a high-confidential but also low-integrity value (in this case
the variable `y`). The secret but entrusted adversary, *H*, can send `x ⊕ z` back to make sure the
low bit of some secret `z` is leaked to *L*.

A single iteration of the above is implemented in Troupe in `pad.trp` with the colluding adversaries
*H* and *L* implemented in `adv_high.trp` and `adv_low.trp`, respectively. The padder, *P*, only
trusts *H* with `<secret; #null-integrity>`, i.e. with high confidentiality but only low integrity.
No trust beyond the default, `{}`, is given to *L*.

In the case of this Troupe implementation, the troublesome endorsement happens implicitly within the
`xor` operation: the result of `xor x y` is given the label `{secret}`, i.e. `y` has affected a
value which requires the `secret` writing permission. The (robust) declassification that follows
seems safe but is not.
