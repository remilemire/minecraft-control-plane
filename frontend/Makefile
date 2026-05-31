FRONTEND_RUN := docker compose run --rm frontend npm run logs

.PHONY: lint format test check clean

lint:
	$(FRONTEND_RUN) lint

format:
	$(FRONTEND_RUN) format

test:
	$(FRONTEND_RUN) test

check:
	$(FRONTEND_RUN) lint format check

logs:
	docker compose logs frontend -f

clean:
	rm -rf dist
	rm -rf .DS_STORE
	

