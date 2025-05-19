# Troupe p2p Relay

This example is adapted from libp2p's Go relay and since then ported
to Javascript's p2p implementation.

## Generating Key

The relay needs a key pair to function; its public *id* has to be
shared with the Troupe nodes via the `default_relays` variable in
`rt/src/p2p/p2pconfig.mjs`. To generate this pair, use the
corresponding *make target* as follows:

```bash
make generate-relay-key
```

## How To Run

To start the relay server, run the corresponding *make target* as follows:

```bash
make start-relay
```
