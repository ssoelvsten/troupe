# Phase 7 - NMIFC Examples

I want to port examples from Cecchetti et al. paper that introduces NMIFC to Troupe (all running in one node). The idea is to demonstrate programs that are insecure without NMIFC enforcement and become secure with it.

The paper is available as `nmifc-cecchetti-et-al.pdf`.

## Paper Summary

The paper introduces **Nonmalleable Information Flow Control (NMIFC)**, which combines:
1. **Robust declassification** - prevents adversaries from influencing what information is released
2. **Transparent endorsement** - the key new insight, dual to robust declassification

### Key Insight: Transparent Endorsement

The paper identifies that endorsing "opaque writes" (data that the endorser could not have read) is dangerous. An endorsement is **transparent** if it only endorses information its authors could read.

### Three Motivating Examples from the Paper

#### Example 1: Fooling a Password Checker (Section 2.1)

```
StringT password;

booleanT← check_password(StringT→ guess) {
    booleanT endorsed_guess = endorse(guess, T);
    booleanT result = (endorsed_guess == password);
    return declassify(result, T←);
}
```

**The vulnerability**: The `guess` parameter is labeled as secret (`T→`), so well-typed code could pass the actual `password` as the guess, allowing authentication without knowing the password! The endorsement on line 4 erroneously treats sensitive information as if an attacker had constructed it.

**The fix**: Label `guess` as `U←` (untrusted but public). Then the guesser must be able to read their own guess, guaranteeing they cannot guess correctly unless they actually know the password.

#### Example 2: Cheating in a Sealed-Bid Auction (Section 2.2)

Two principals A (Alice) and B (Bob) submit sealed bids to auctioneer T:
1. Alice sends `a_bid` with label `A← ∧ (A ∧ B)→`
2. T endorses and broadcasts `a_bid`
3. Bob constructs `b_bid` with label `B← ∧ (A ∧ B)→`
4. T endorses `b_bid` to `A ∧ B`
5. T declassifies both bids

**The vulnerability**: Nothing prevents Bob from setting `b_bid := a_bid + 1`, always winning with minimal bid! Bob can read the broadcasted (but still confidential) `a_bid`.

**The fix**: Label bids as `A` and `B` respectively (not jointly confidential), so Bob cannot base his bid on Alice's.

#### Example 3: Laundering Secrets (Section 2.3)

```
while (true) do {
    x = 0 [] x = 1;  // generate secret probabilistically
    output x to H;
    input y from H;  // implicit endorsement
    output x ⊕ (y mod 2) to L
}
```

**The vulnerability**: An adversary can launder secret `z` by sending `z⊕x` as `y`. The output `x ⊕ (z⊕x mod 2)` reveals the low bit of `z` to L.

## Porting Strategy to Troupe

For Troupe, we should focus on **Example 1 (Password Checker)** as it's:
- Most directly applicable to actor-based systems
- Clear real-world relevance
- Demonstrates the core NMIFC principle

### Troupe Implementation

The example is implemented in:
`tests/_unautomated/claude/password-checker-cecchetti.trp`

#### DC Label Mapping

The paper uses FLAM labels with separate confidentiality (`→`) and integrity (`←`) projections.
Troupe uses DC labels `<S; I>` where S is confidentiality and I is integrity.

| Paper Concept | Paper Notation | Troupe DC Label |
|---------------|----------------|-----------------|
| Password (secret & trusted) | `T` | `{server}` = `<server; server>` |
| Legitimate guess (symmetric) | N/A | `{server}` = `<server; server>` |
| Attack guess (corrupt) | Implicit | `<server; attacker>` |

#### The Corrupt Label Attack

The key insight is using a **corrupt label** where integrity does not imply confidentiality:

```
<server; attacker>   -- secret to server, but attacker integrity
```

This is corrupt because: `attacker ⟹ server` is **FALSE**

#### NMIFC Transparency Check

When trying to endorse `<server; attacker>` to `{server}` = `<server; server>`:

```
Transparency condition: I_from ⟹ I_to ∨ (S_from ∧ S_pc)

With PC at bottom (S_pc = TRUE):
attacker ⟹ server ∨ (server ∧ TRUE)
= attacker ⟹ server
= FALSE   ← Transparency violation!
```

#### Running the Example

```bash
# Attack SUCCEEDS without NMIFC (insecure)
./local.sh tests/_unautomated/claude/password-checker-cecchetti.trp --no-nmifc

# Attack BLOCKED with NMIFC (secure)
./local.sh tests/_unautomated/claude/password-checker-cecchetti.trp --nmifc
```

#### Output Comparison

**Without NMIFC:**
```
"=== Password Checker NMIFC Demo ==="
"Checking a legitimate (symmetric) guess..."
"  -> Rejected (as expected)"
"Attempting the ATTACK with a corrupt guess..."
"  Label of corrupt guess: <server; attacker>"
"  Attempting to endorse to {server}..."
"  -> ATTACK SUCCEEDED: Authenticated without legitimate authority!"
"=== Demo Complete ==="
```

**With NMIFC:**
```
"=== Password Checker NMIFC Demo ==="
"Checking a legitimate (symmetric) guess..."
"  -> Rejected (as expected)"
"Attempting the ATTACK with a corrupt guess..."
"  Label of corrupt guess: <server; attacker>"
"  Attempting to endorse to {server}..."
Runtime error in thread ...
>> NMIFC transparency violation for endorsement
 | The confidentiality of the data and PC do not permit this endorsement.
 | level of the data: <server;attacker> (corrupt: true)
 | target level: {server}
 | PC level: {} (corrupt: false)
```

## Key Takeaways

1. **Corrupt labels are the key**: The attack relies on a label where integrity doesn't imply confidentiality
2. **NMIFC transparency check**: Prevents endorsing "opaque writes" (secret data from untrusted sources)
3. **Practical implication**: An attacker who obtains secret data cannot "launder" it through endorsement
4. **Troupe implementation**: NMIFC is enabled with `--nmifc` flag (or by default since it's on the dev-integrity-nmifc-alpha branch)

---

## Phase 7b: Actor-Based Password Checker

The previous example demonstrates NMIFC in a sequential setting. This section describes a more realistic **actor-based** version that uses Troupe's message-passing primitives.

### Goal

Create a password authentication server that:
1. Runs as a server actor in a loop, receiving authentication requests
2. Has an attacker actor that sends a malicious request
3. The attacker waits for an ACK/NACK response
4. Demonstrates NMIFC blocking the attack at the message endorsement point

### Architecture

```
┌─────────────────┐         ┌─────────────────────────┐
│  Attacker Actor │ ──────► │  Password Server Actor  │
│                 │         │                         │
│  - Has the      │  send   │  - Stores secret pwd    │
│    password     │  AUTH   │  - receive loop         │
│    value (but   │  REQ    │  - endorse incoming     │
│    labeled      │         │    guess                │
│    corrupt)     │         │  - compare to password  │
│                 │ ◄────── │  - send ACK/NACK        │
│  - Receives     │  send   │                         │
│    ACK or crash │  RESP   │                         │
└─────────────────┘         └─────────────────────────┘
```

### Message Protocol

```sml
(* Message types *)
datatype AuthMsg =
    AuthRequest    (* (guess, reply_to) tuple follows *)
  | AuthResponse   (* bool follows *)
  | Shutdown
```

### Label Design

| Component        | Label                                     | Rationale                                    |
|------------------|-------------------------------------------|----------------------------------------------|
| Server's password| `{server}` = `<server; server>`           | Secret and trusted by server                 |
| Legitimate guess | `{server}` or `<#null-confidentiality; x>`| Either trusted code or public untrusted      |
| Attack guess     | `<server; attacker>`                      | **CORRUPT**: secret (server), but attacker integrity |
| Auth response    | `<#null-confidentiality; server>`         | Public result, server-trusted                |

### The Attack Scenario

1. **Setup**: The attacker somehow obtains the password value (e.g., through a data breach, insider threat, or bug)

2. **Attack**: The attacker sends an `AuthRequest` message containing the password value, but labeled with attacker integrity:
   ```sml
   val stolen_password = "secret123" raisedTo `<server; attacker>`
   send(server_pid, (AuthRequest, stolen_password, self()))
   ```

3. **Server Processing**: When the server receives the message:
   - The message arrives with the attacker's label `<server; attacker>`
   - Server attempts to `endorse` the guess to `{server}` before comparison
   - **Without NMIFC**: Endorsement succeeds, comparison succeeds, ACK sent
   - **With NMIFC**: Endorsement fails (transparency violation), thread crashes

4. **Outcome**:
   - **Without NMIFC**: Attacker receives `AuthResponse(true)` - authenticated!
   - **With NMIFC**: Server thread crashes, attacker receives nothing (or timeout)

### Troupe Actor Patterns Reference

From existing Troupe tests, the standard actor patterns are:

```sml
(* Spawning an actor *)
val pid = spawn (fn () => actor_loop ())

(* Or with a named function *)
fun server_loop () = receive [ ... ]
val pid = spawn server_loop

(* Sending messages *)
send (pid, (MessageTag, arg1, arg2))

(* Receiving with pattern matching *)
receive [
    hn (Tag1, x, y) => ... handle Tag1 ...
  , hn (Tag2, z) => ... handle Tag2 ...
  , hn Tag3 => ... handle Tag3 ...
]

(* Self reference for reply-to pattern *)
val my_pid = self ()
send (server, (Request, data, my_pid))
receive [ hn (Response, result) => ... ]
```

### Implementation Outline

```sml
(* File: password-checker-actor.trp *)

datatype AuthMsg = AuthRequest | AuthResponse | Shutdown

let
    (* ============================================
       PASSWORD SERVER ACTOR
       ============================================ *)
    val server_password = "correct_horse_battery_staple" raisedTo `{server}`

    fun server_loop () =
        receive [
            hn (AuthRequest, guess, reply_to) =>
                let
                    val _ = print "Server: Received auth request"

                    (* THIS IS THE CRITICAL POINT:
                       Endorse the incoming guess to server trust level.
                       - Without NMIFC: Always succeeds with authority
                       - With NMIFC: Fails if guess has corrupt label *)
                    val endorsed_guess = endorse (guess, authority, `{server}`)

                    val result = (endorsed_guess = server_password)
                    val public_result = declassify (result, authority,
                                                    `<#null-confidentiality; server>`)

                    val _ = send (reply_to, (AuthResponse, public_result))
                in
                    server_loop ()
                end

          , hn Shutdown =>
                print "Server: Shutting down"
        ]

    (* ============================================
       ATTACKER ACTOR
       ============================================ *)
    fun attacker (server_pid, stolen_password) =
        let
            val _ = print "Attacker: Sending stolen password as guess"

            (* The attack: send the stolen password with corrupt label *)
            val attack_guess = stolen_password raisedTo `<server; attacker>`
            val _ = send (server_pid, (AuthRequest, attack_guess, self()))

            val _ = print "Attacker: Waiting for response..."
        in
            receive [
                hn (AuthResponse, success) =>
                    if success then
                        print "ATTACK SUCCEEDED: Authenticated!"
                    else
                        print "Attack failed: Wrong password"
            ]
        end

    (* ============================================
       MAIN: Start server and attacker
       ============================================ *)
    val server_pid = spawn server_loop

    (* The attacker somehow knows the password value *)
    val leaked_password = "correct_horse_battery_staple"

in
    (* Spawn attacker who will send the attack *)
    spawn (fn () => attacker (server_pid, leaked_password));

    (* Give time for interaction, then cleanup *)
    sleep 1000;
    send (server_pid, Shutdown)
end
```

### Expected Behavior

#### Without NMIFC (`--no-nmifc`)

```
"Attacker: Sending stolen password as guess"
"Server: Received auth request"
"Attacker: Waiting for response..."
"ATTACK SUCCEEDED: Authenticated!"
"Server: Shutting down"
```

#### With NMIFC (`--nmifc`)

```
"Attacker: Sending stolen password as guess"
"Server: Received auth request"
Runtime error in thread <server-thread-id>
>> NMIFC transparency violation for endorsement
 | The confidentiality of the data and PC do not permit this endorsement.
 | level of the data: <server;attacker> (corrupt: true)
 | target level: {server}
 | PC level: {} (corrupt: false)
"Attacker: Waiting for response..."
(attacker hangs forever - no response arrives because server crashed)
```

### Key Differences from Sequential Version

| Aspect              | Sequential Version         | Actor Version                          |
|---------------------|---------------------------|----------------------------------------|
| Data flow           | Direct function call      | Message passing                        |
| Attack vector       | Pass corrupt value to fn  | Send corrupt value in message          |
| Failure mode        | Thread error              | Server thread crashes, client hangs    |
| Real-world relevance| Academic                  | Closer to distributed systems          |
| IFC interaction     | Just endorsement          | Message labels + endorsement           |

### Implementation Notes

1. **Message Labels**: In Troupe, messages carry labels. When the attacker sends a message with `<server; attacker>` data, the message's label reflects this.

2. **Receive and Labels**: When the server receives the message, the data maintains its label. The server must explicitly endorse before trusted comparison.

3. **Error Handling**: In the attack scenario with NMIFC, the server thread crashes. A production system might want to catch this and send an error response. For the demo, we show the raw failure.

4. **No Timeout in Demo**: For simplicity, the attacker waits indefinitely. A real system would use `receiveWithTimeout`.

5. **The `raisedTo` operation**: This raises the label of a value. When we do `password raisedTo \`<server; attacker>\``, we're creating a value with the same content but a different (corrupt) label.

### Files to Create

```
tests/_unautomated/claude/password-checker-actor.trp
```

### Running the Actor Version

```bash
# Attack SUCCEEDS without NMIFC
./local.sh tests/_unautomated/claude/password-checker-actor.trp --no-nmifc

# Attack BLOCKED with NMIFC (server crashes, attacker hangs)
./local.sh tests/_unautomated/claude/password-checker-actor.trp --nmifc
```

### Why This Matters

This actor-based version demonstrates that NMIFC protections work correctly in Troupe's core use case: **distributed actor systems with message passing**. The attack is more realistic because:

1. **Data leaks happen**: Passwords get leaked through breaches, logs, backups
2. **Attackers have access**: They may be able to send messages to your service
3. **The attack is subtle**: The attacker has the *value* but shouldn't be able to *use* it as if they legitimately knew it
4. **NMIFC closes the gap**: The integrity label tracks that the attacker doesn't have legitimate knowledge, even if they have the bits

### Potential Extensions

1. **Timeout handling**: Have the attacker use `receiveWithTimeout` to detect the server crash
2. **Multiple clients**: Show that legitimate clients still work while attack is blocked
3. **Logging**: Add server-side logging to show the difference in behavior
4. **Trust levels**: Demonstrate different trust levels for different client types
