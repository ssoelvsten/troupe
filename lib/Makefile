COMPILER=../bin/troupec

build:
	mkdir -p out
	$(COMPILER) ./nsuref.trp -l
	$(COMPILER) ./string.trp -l
	$(COMPILER) ./printService.trp -l
	$(COMPILER) ./lists.trp -l
	$(COMPILER) ./timeout.trp -l
	$(COMPILER) ./NetHealth.trp -l
	$(COMPILER) ./declassifyutil.trp -l
	$(COMPILER) ./stdio.trp -l
	$(COMPILER) ./raft.trp -l
	$(COMPILER) ./raft_debug.trp -l
	$(COMPILER) ./bst.trp -l
	$(COMPILER) ./localregistry.trp -l
	$(COMPILER) ./hash.trp -l
	$(COMPILER) ./hamt.trp -l

clean:
	rm -rf out
