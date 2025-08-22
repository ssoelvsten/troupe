COMPILER=../bin/troupec

build:
	mkdir -p out
	$(COMPILER) ./nsuref.trp -l
	$(COMPILER) ./string.trp -l
	$(COMPILER) ./printService.trp -l
	$(COMPILER) ./List.trp -l
	$(COMPILER) ./timeout.trp -l
	$(COMPILER) ./NetHealth.trp -l
	$(COMPILER) ./declassifyutil.trp -l
	$(COMPILER) ./stdio.trp -l
	$(COMPILER) ./raft.trp -l
	$(COMPILER) ./raft_debug.trp -l
	$(COMPILER) ./bst.trp -l
	$(COMPILER) ./localregistry.trp -l
	$(COMPILER) ./Hash.trp -l
	$(COMPILER) ./hamt.trp -l
	$(COMPILER) ./Unit.trp -l

clean:
	rm -rf out
