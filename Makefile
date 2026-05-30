APPS := backend frontend

default: install

install line format test clean:
	for app in $(APPS); do \
		$(MAKE) -C $$app $@; \
	done

run:
	$(MAKE) -C backend run & $(MAKE) -C frontend run

migrate:
	$(MAKE) -C backend migrate

build:
	$(MAKE) -C frontend build

up:
	docker compose up -d

down:
	docker compose down

.PHONY: install run lint format test docker default build clean