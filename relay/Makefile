help:
	cat README.md

start: start/basic

start/silent:
	node relay.mjs

start/basic:
	DEBUG=libp2p:circuit-relay:server node relay.mjs

start/verbose:
	DEBUG=libp2p:circuit-relay:server,libp2p:yamux:trace node relay.mjs

keys:
	mkdir -p keys
	node $(TROUPE)/rt/built/p2p/mkid.mjs --privkeyfile=keys/relay.priv --idfile=keys/relay.id --verbose

clean:
	rm -rf keys
