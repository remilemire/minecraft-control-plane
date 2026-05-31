APPS := backend frontend

.PHONY: up down lint format test check reset clean logs

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

	rm -rf .DS_STORE

logs:
	docker compose logs -f

lint format test check:
	for app in $(APPS); do \
		$(MAKE) -C $$app $@; \
	done

