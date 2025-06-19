MKID=node $(TROUPE)/p2p-tools/built/mkid.mjs
MKALIASES=node $(TROUPE)/p2p-tools/built/mkaliases.js
START=$(TROUPE)/network.sh

one.listener:
	$(START) zero.trp --id=ids/one.json --rspawn=true --aliases=aliases.json --stdiolev={}

three.listener:
	$(START) zero.trp --id=ids/three.json --rspawn=true --aliases=aliases.json --stdiolev={}

two:
	$(START) two.trp --id=ids/two.json --aliases=aliases.json  # --debug --debugp2p

create-network-identifiers:
	mkdir -p ids
	$(MKID) --outfile=ids/one.json
	$(MKID) --outfile=ids/two.json
	$(MKID) --outfile=ids/three.json
	$(MKALIASES) --include ids/one.json --include ids/two.json --include ids/three.json --outfile aliases.json
