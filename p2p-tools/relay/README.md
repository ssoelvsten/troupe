# Troupe p2p Relay

This example is adapted from libp2p's Go relay and since then ported to
JavaScript's p2p implementation.

## Build

The relay is written in TypeScript. To compile it to JavaScript, such that it
can run, please use the following *Make* target:

```bash
make build/relay
```

The relay needs a key pair to function; its public *id* has to be shared with
the Troupe nodes via the `default_relays` variable in
`rt/src/p2p/p2pconfig.mjs`. To generate this pair, use the corresponding target
as follows:

```bash
make build/keys
```

To remove the build artifact `relay.mjs` and the keys, use the following
target:

```bash
make clean
```

## How To Run

To start the relay server, run the corresponding *Make* target as follows:

```bash
make start
```

This starts the server with `basic` logging, including the respective 'keep
alive' messages sent from each Troupe node. To run silently, instead run

```bash
make start/silent
```

To start it with verbose information about all traffic, run the following
target:

```bash
make start/verbose
```
