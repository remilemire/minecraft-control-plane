# Makefile — dev workflow for the pnpm monorepo + Docker Compose stack.
# Run `make` (or `make help`) to list targets.

COMPOSE := docker compose
PNPM    := pnpm

# Scope workspace scripts to one package with `pkg=`, e.g. `make test pkg=backend`.
# With no pkg, scripts run across every workspace; `--no-bail` means one failing
# workspace does not stop the others (all failures are reported at the end).
SEL := $(if $(pkg),--filter @minecraft-server/$(pkg),-r)
RUN  = $(PNPM) $(SEL) --no-bail --if-present run

.DEFAULT_GOAL := help

# ---- Meta -------------------------------------------------------------------

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---- Docker -----------------------------------------------------------------

.PHONY: up down restart ps logs logs-db logs-backend logs-frontend logs-minecraft nuke

up: ## Build and start the stack (detached)
	$(COMPOSE) up --build -d

down: ## Stop the stack
	$(COMPOSE) down

restart: down up ## Restart the stack

ps: ## Show running services
	$(COMPOSE) ps

logs: ## Tail all logs
	$(COMPOSE) logs -f

logs-db: ## Tail db logs
	$(COMPOSE) logs -f db

logs-backend: ## Tail backend logs
	$(COMPOSE) logs -f backend

logs-frontend: ## Tail frontend logs
	$(COMPOSE) logs -f frontend

logs-minecraft: ## Tail minecraft logs
	$(COMPOSE) logs -f minecraft

nuke: ## Stop, remove volumes/orphans, and rebuild from scratch
	$(COMPOSE) down -v --remove-orphans
	$(COMPOSE) build --no-cache

# ---- Node / workspaces (add `pkg=backend` to scope any of these) ------------

.PHONY: install build dev test lint format check

install: ## Install dependencies (frozen lockfile)
	$(PNPM) install --frozen-lockfile

build: ## Build workspaces
	$(RUN) build

dev: ## Run dev servers in parallel
	$(PNPM) $(SEL) --parallel --if-present run dev

test: ## Test workspaces (keeps going if one fails)
	$(RUN) test

lint: ## Lint and auto-fix workspaces
	$(RUN) lint

format: ## Format workspaces
	$(RUN) format

check: format lint test ## Format, lint, then test everything
