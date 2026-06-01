# Makefile

APPS := backend frontend

.PHONY: up down lint format test check reset clean logs install

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose down
	docker compose up -d

reset:
	docker compose down -v --remove-orphans
	docker compose build --no-cache
	docker compose up -d

clean:
	for app in $(APPS); do \
		$(MAKE) -C $$app clean; \
	done

	find . -name ".DS_Store" -delete

logs:
	docker compose logs -f

lint format test check install:
	for app in $(APPS); do \
		$(MAKE) -C $$app $@; \
	done

