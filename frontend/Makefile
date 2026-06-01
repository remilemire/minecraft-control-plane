# frontend/Makefile

.PHONY: lint format test check clean install

install:
	npm ci

lint:
	npm run lint

format:
	npm run format

test:
	npm run test

check:
	npm run lint format check

logs:
	docker compose logs frontend -f

clean:
	rm -rf dist
	find . -name ".DS_Store" -delete
	

