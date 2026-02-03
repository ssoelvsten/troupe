help:
	cat README.md

start: start/basic

start/silent:
	node relay.mjs

start/basic:
	DEBUG=libp2p:circuit-relay:server node relay.mjs

start/verbose:
	DEBUG=libp2p:circuit-relay:server,libp2p:yamux:trace node relay.mjs

build: build/relay

build/keys:
	mkdir -p keys
	node $(TROUPE)/p2p-tools/built/mkid.mjs --privkeyfile=keys/relay.priv --idfile=keys/relay.id --verbose

build/relay:
	tsc

clean: clean/keys clean/relay

clean/keys:
	rm -rf keys

clean/relay:
	rm relay.mjs
