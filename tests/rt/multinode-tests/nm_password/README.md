# Nonmalleability Password Example

In Cecchetti et al.'s CCS'17 paper on *Nonmalleable Information Flow*, they show the following
program as an example of regular IFC not being sufficient.

```java
String<T> password;

boolean isPassword(String<T→> guess) {
  boolean<T> endorsedGuess = endorse(guess, T);
  boolean<T> result = endorsedGuess == password;
  return declassify(result, T←)
}
```

Yet, while `guess` is untrusted but secret (`<T→>`), the type system does not ensure that the
adversary provides a reference to `password` despite the fact they are not allowed to read it. This
is because the type system accepts the flow of *T ⊑ T→* as it is a flow of trusted to untrusted
information.

The above is implemented in Troupe as a server (`password_service.trp`) that the adversary
(`adversary.trp`) can request data from contact. Yet, the IFC in Troupe (without nonmalleability)
handles the following behaviours of `password_service` correctly:

- Respond with `isPassword password` evaluated to `true` is accepted. This is correct, as we wanted
  to `declassify` this one bit of information.
- Respond with `isPassword` is rejected. This is correct, as it will send `password` as part of its
  closure.
- Respond with a deferred evaluation of `isPassword password` is also rejected. This is correct as
  `closure` is part of this functions closure.

At the same time, it should not be possible to for the adversary to send arbitrary code to be run on
the server which also has `isPassword` and/or `password` in its scope. Even if `isPassword` or
`password` was given to arbitrary code, Troupe's runtime would block sending it back to the
adversary.

