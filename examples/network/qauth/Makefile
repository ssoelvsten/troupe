TROUPE_ROOT=../../..
MKID=node $(TROUPE_ROOT)/p2p-tools/built/mkid.mjs
MKALIASES=node $(TROUPE_ROOT)/p2p-tools/built/mkaliases.js
START=$(TROUPE_ROOT)/network.sh

# Server configuration
# No trustmap: server does NOT trust the client
SERVER_PORT=6790
SERVER_CMD=$(START) auth-server.trp --debugquarantine --disable-relay --id=ids/server.json --port=$(SERVER_PORT)

# Client configuration
# Client trusts the server (via trustmap)
CLIENT_CMD=$(START) auth-client.trp --debugquarantine --disable-relay --id=ids/client.json --aliases=aliases.json --trustmap=client-trustmap.json

# Run both server and client together
# Usage: make run (or: make setup && make run)
# Pass CLIENT_ARGS to send CLI arguments to the client (e.g., make run CLIENT_ARGS="correct")
run: check-setup
	@echo "Starting server in background..." && \
	$(SERVER_CMD) & SERVER_PID=$$!; \
	sleep 2; \
	echo "Starting client..."; \
	$(CLIENT_CMD) $(if $(CLIENT_ARGS),-- $(CLIENT_ARGS),); CLIENT_EXIT=$$?; \
	echo "Client finished, waiting for server..."; \
	wait $$SERVER_PID; SERVER_EXIT=$$?; \
	echo "Done. Server exit: $$SERVER_EXIT, Client exit: $$CLIENT_EXIT"; \
	exit $$CLIENT_EXIT

# Run with correct password (authentication succeeds)
run-correct: check-setup
	@$(MAKE) run CLIENT_ARGS=correct

# Run with wrong password (authentication fails) - same as default
run-wrong: check-setup
	@$(MAKE) run CLIENT_ARGS=wrong

# Server: does NOT trust the client (no trustmap)
server: check-setup
	$(SERVER_CMD)

# Client: trusts the server at level {alice}
# Usage: make client or make client CLIENT_ARGS=correct
client: check-setup
	$(CLIENT_CMD) $(if $(CLIENT_ARGS),-- $(CLIENT_ARGS),)

client-correct: check-setup
	@$(MAKE) client CLIENT_ARGS=correct

client-wrong: check-setup
	@$(MAKE) client CLIENT_ARGS=wrong

# Full setup: create identifiers and client trustmap
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
	pkill -f "auth-server.trp" 2>/dev/null || true

.PHONY: run run-correct run-wrong server client client-correct client-wrong setup check-setup create-network-identifiers clean
