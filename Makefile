COMPOSE := docker compose

.PHONY: env config up down status logs check public-publish

## Seed .env from .env.example with random secrets. Never overwrites an existing .env.
env:
	@if [ -f .env ]; then echo ".env already exists — not overwriting."; exit 1; fi
	@cp .env.example .env
	@chmod 600 .env
	@sed -i 's/^LEMMY_DB_PASSWORD=$$/LEMMY_DB_PASSWORD='"$$(openssl rand -hex 32)"'/' .env
	@sed -i 's/^LEMMY_PICTRS_API_KEY=$$/LEMMY_PICTRS_API_KEY='"$$(openssl rand -hex 32)"'/' .env
	@echo ".env created with random Lemmy secrets (chmod 600)."
	@echo "Turnstile keys are left empty: set TURNSTILE_SITE_KEY and TURNSTILE_SECRET together or neither."

## Render .lemmy/config.hjson from the template using .env (Lemmy reads no env vars).
config:
	@if [ ! -f .env ]; then echo ".env missing — run 'make env' first."; exit 1; fi
	@set -a; . ./.env; set +a; \
	if [ -z "$$LEMMY_DB_PASSWORD" ] || [ -z "$$LEMMY_PICTRS_API_KEY" ]; then \
		echo "config: LEMMY_DB_PASSWORD and LEMMY_PICTRS_API_KEY must be non-empty in .env"; exit 1; \
	fi; \
	mkdir -p .lemmy; \
	envsubst '$${LEMMY_DOMAIN} $${LEMMY_DB_PASSWORD} $${LEMMY_PICTRS_API_KEY}' \
		< lemmy/config.hjson.template > .lemmy/config.hjson; \
	chmod 600 .lemmy/config.hjson
	@echo ".lemmy/config.hjson rendered."

## Render config, then start the whole stack.
up: config
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

status:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=100

## Static checks: JS syntax (ESM via temp .mjs), compose config, index.html asset refs.
check:
	@node --check proxy/server.js
	@for f in js/*.js; do \
		tmp=$$(mktemp /tmp/athens-check-XXXXXX.mjs); \
		cp "$$f" "$$tmp"; \
		node --check "$$tmp" || { echo "syntax error: $$f"; rm -f "$$tmp"; exit 1; }; \
		rm -f "$$tmp"; \
	done
	@$(COMPOSE) config -q
	@fail=0; \
	for p in $$(grep -oE '"(/(css|js|logo)[^"]*)"' index.html | tr -d '"'); do \
		if [ ! -f ".$$p" ]; then echo "index.html references missing file: $$p"; fail=1; fi; \
	done; exit $$fail
	@echo "check: OK"

## 📢 Commit and push changes from the athensarea-content submodule
public-publish:
	@echo "📦 Staging all changes in $(CURDIR)..."
	git add .
	git status
	@read -p '✍️ Enter commit message: ' msg; \
	git commit -m "$$msg" && git push
	@echo "✅ Changes pushed from public/ to origin."
