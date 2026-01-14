MKID=node $(TROUPE)/p2p-tools/built/mkid.mjs
MKALIASES=node $(TROUPE)/p2p-tools/built/mkaliases.js
START=$(TROUPE)/network.sh

# Run both server and client together
# Usage: make run (or: make setup && make run)
run: check-setup
	@echo "Starting server in background..."
	$(START) echo-server.trp --id=ids/server.json --port=6789 &
	@sleep 2
	@echo "Starting client..."
	$(START) echo-client.trp --id=ids/client.json --aliases=aliases.json --trustmap=client-trustmap.json
	@echo "Done. You may need to kill the server manually (pkill -f echo-server)"

# Server: does NOT trust the client (no trustmap entry for client)
# This means information from the client will be downgraded to BOT level
server: check-setup
	$(START) echo-server.trp --id=ids/server.json --port=6789

# Client: trusts the server at level {alice}
# This allows the client to send {alice}-level data to the server
client: check-setup
	$(START) echo-client.trp --id=ids/client.json --aliases=aliases.json --trustmap=client-trustmap.json

# Full setup: create identifiers and trustmap
setup: create-network-identifiers create-trustmap
	@echo "Setup complete. Run 'make run' to start both nodes."

check-setup:
	@test -f ids/server.json || (echo "Run 'make setup' first" && exit 1)
	@test -f client-trustmap.json || (echo "Run 'make setup' first" && exit 1)

create-network-identifiers:
	mkdir -p ids
	$(MKID) --outfile=ids/server.json
	$(MKID) --outfile=ids/client.json
	$(MKALIASES) --include ids/server.json --include ids/client.json --outfile aliases.json

# Create trustmap: client trusts server at {alice} (DC label format: <alice;alice>)
create-trustmap: ids/server.json
	@SERVER_ID=$$(node -e "console.log(require('./ids/server.json').id)"); \
	echo "[{\"id\": \"$$SERVER_ID\", \"level\": {\"confidentiality\": [[\"alice\"]], \"integrity\": [[\"alice\"]]}}]" > client-trustmap.json
	@echo "Created client-trustmap.json"

clean:
	rm -rf ids/ aliases.json client-trustmap.json out/
	pkill -f "echo-server.trp" 2>/dev/null || true

.PHONY: run server client setup check-setup create-network-identifiers create-trustmap clean
