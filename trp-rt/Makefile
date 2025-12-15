COMPILER=../bin/troupec

build:
	mkdir -p out
  # Standard Library
	$(COMPILER) ./service.trp -l
	$(COMPILER) ./P2PCache.trp --output out/P2PCache.js # -l

clean:
	rm -rf out
