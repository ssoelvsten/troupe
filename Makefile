.PHONY: rt compiler p2p-tools

# TODO: Rename to 'build/*' ?
all: npm rt compiler p2p-tools libs service

npm:
	npm install
	npm install -g typescript

rt:
	cd rt; $(MAKE) all

COMPILER=./bin/troupec
compiler:
	cd compiler; $(MAKE) all

p2p-tools:
	cd p2p-tools; tsc

libs:
	$(COMPILER) ./lib/nsuref.trp -l
	$(COMPILER) ./lib/string.trp -l
	$(COMPILER) ./lib/printService.trp -l
	$(COMPILER) ./lib/lists.trp -l
	$(COMPILER) ./lib/declassifyutil.trp -l
	$(COMPILER) ./lib/stdio.trp -l
	$(COMPILER) ./lib/timeout.trp -l
	$(COMPILER) ./lib/raft.trp -l
	$(COMPILER) ./lib/raft_debug.trp -l
	$(COMPILER) ./lib/bst.trp -l
	$(COMPILER) ./lib/localregistry.trp -l

service:
	$(COMPILER) ./trp-rt/service.trp -l

# TODO: Rename to 'clean/*' ?
clear: clear/stack clear/rt
clear/compiler:
	cd compiler; $(MAKE) clear
clear/rt:
	cd rt; $(MAKE) clear
clear/p2p-tools:
	cd p2p-tools; $(MAKE) clear

ci-test-golden-no-color:
	mkdir -p out 
	./bin/golden --no-color

test: test/local test/multinode
test/local:
	mkdir -p out
	cd compiler && $(MAKE) test
test/multinode:
	./scripts/run-multinode-tests.sh

dist: stack npm rt p2p-tools libs
	rm -rf ./build/
	mkdir -p ./build/Troupe/rt/built
	mkdir -p ./build/Troupe/p2p-tools/built
	mkdir -p ./build/Troupe/bin
	cp -RP bin  ./build/Troupe
	cp -RL lib ./build/Troupe/
	cp -RL trustmap.json ./build/Troupe/trustmap.json
	cp -RL node_modules ./build/Troupe/node_modules
	cp -RL rt/built ./build/Troupe/rt/
	cp -RL p2p-tools/built ./build/Troupe/p2p-tools/
	cp rt/troupe ./build/Troupe/rt/troupe
	cp local.sh ./build/Troupe/bin/local.sh
	cp network.sh ./build/Troupe/bin/network.sh
	cp -RL tests ./build/Troupe/

build-and-push/docker:
	docker build -t jbay/troupe . && docker push jbay/troupe

build-and-push/repo:
	docker build -t jbay/troupe git@github.com:aslanix/Troupe.git\#devraft && docker push jbay/troupe
