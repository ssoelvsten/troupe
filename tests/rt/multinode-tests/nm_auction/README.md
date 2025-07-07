# Nonmalleability Auction Example

In Cecchetti et al.'s CCS'17 paper on *Nonmalleable Information Flow*, they show the following
protocol for a two-party auction between Alice, *A*, and Bob, *B*, via an auctioneer, *T*. The
protocol runs as follows:

1. *A* sends her bid `a_bid` to *T* with label `<alice & bob; alice>`.
2. *T* accepts `a_bid` and endorses it to `<alice & bob; alice & bob>`. The resulting bid is
   broadcast to *A* and *B* to simulate an open wire.
3. *B* sends his `b_bid` to *T* with label `<alice & bob; bob>`.
4. *T* accepts `b_bid` and endorses it to `<alice & bob; alice & bob>` and again broadcasts the
   result.
5. *T* declassifies both bids to find the winner which then is announced.

Yet, *B* can maul his bid, `b_bid` by adding one to `a_bid` (despite the labels from *T*'s point of
view does not allow him to do so). In step 4, *T* should not be endorsing the new bid, since it can
depend on confidential information that should be inaccessible to *B*. The fix would be to make
`a_bid` only have label `{alice}`.

The above is implemented in Troupe with `alice.trp` (*A*), `bob.trp` (*B*), and `auctioneer.trp`
(*T*). To get this example to run in Troupe where `auctioneer.trp` only trusts *A* with label
`alice` and *B* with label `bob`, it has to *declassify* both `a_bid` and `b_bid` when broadcasting
it as part of steps 2 and 4. If removed, the implementation of *B* would have to listen on the wire,
and hope to be able to maul `b_bid` by breaking the encryption between *A* and *T* in real time.

The code of `auctioneer` also includes quite a few other declassifications and endorsements to not
raise the *pc* and *bl* too far; quite a lot of this could be avoided with gradual types.
