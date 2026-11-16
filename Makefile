# Makefile — dev workflow for the pnpm monorepo + Docker Compose stack.
# Run `make` (or `make help`) to list targets.

# APP_ENV comes from the root .env (the same switch that used to pick the
# compose build targets). prod swaps the auto-loaded dev compose.override.yaml
# for the compose.prod.yaml overlay. One-shot override: `make up APP_ENV=dev`.
APP_ENV ?= $(strip $(shell sed -n 's/^APP_ENV=\([a-zA-Z]*\).*/\1/p' .env 2>/dev/null))

ifeq ($(APP_ENV),prod)
COMPOSE := docker compose -f compose.yaml -f compose.prod.yaml
else
COMPOSE := docker compose
endif

PNPM := pnpm

# Scope workspace scripts to one package with `pkg=`, e.g. `make test pkg=backend`.
# With no pkg, scripts run across every workspace; `--no-bail` means one failing
# workspace does not stop the others (all failures are reported at the end).
SEL := $(if $(pkg),--filter @minecraft-control-plane/$(pkg),-r)
RUN  = $(PNPM) $(SEL) --no-bail --if-present run

.DEFAULT_GOAL := help

.PHONY: backup-recover
backup-recover: ## Retry an interrupted backup recovery after inspecting the server
	$(COMPOSE) exec minecraft-controller $(if $(filter prod,$(APP_ENV)),node dist/maintenance/cli.js,pnpm exec tsx src/maintenance/cli.ts) recover

# ---- Meta -------------------------------------------------------------------

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---- Docker -----------------------------------------------------------------

.PHONY: up down restart ps logs db-logs backend-logs frontend-logs minecraft-logs minecraft-controller-logs caddy-logs nuke migrate

up: ## Build and start the stack (detached)
	$(COMPOSE) up --build -d

down: ## Stop the stack
	$(COMPOSE) down

restart: down up ## Restart the stack

ps: ## Show running services
	$(COMPOSE) ps

logs: ## Tail all logs
	$(COMPOSE) logs -f

# TODO: Generalize to *-logs

db-logs: ## Tail db logs
	$(COMPOSE) logs -f db

backend-logs: ## Tail backend logs
	$(COMPOSE) logs -f backend

frontend-logs: ## Tail frontend logs
	$(COMPOSE) logs -f frontend

minecraft-logs: ## Tail minecraft logs
	$(COMPOSE) logs -f minecraft

minecraft-controller-logs: ## Tail minecraft-controller logs
	$(COMPOSE) logs -f minecraft-controller

caddy-logs: ## Tail caddy logs (prod stack only)
	$(COMPOSE) logs -f caddy

# END TODO

nuke: ## Stop, remove volumes/orphans, and rebuild from scratch
	$(COMPOSE) down -v --remove-orphans
	$(COMPOSE) build --no-cache

migrate: ## Apply pending DB migrations inside the running backend container (dev)
ifeq ($(APP_ENV),prod)
	$(error APP_ENV=prod: migrations run automatically on backend boot)
else
	$(COMPOSE) exec backend pnpm --filter @minecraft-control-plane/backend db:migrate
endif

# ---- Node / workspaces (add `pkg=backend` to scope any of these) ------------

.PHONY: install build dev test lint format typecheck check

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

typecheck: ## Type-check workspaces (no emit)
	$(RUN) typecheck

check: format lint typecheck test ## Format, lint, type-check, then test everything

# TODO: add test-*, lint-*, format-*, and check-*
