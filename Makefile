SHELL := /bin/sh

.PHONY: api-test web-test lint build dev-api dev-web tidy

tidy:
	cd apps/api && go mod tidy
	cd apps/web && npm install

api-test:
	cd apps/api && go test ./...

web-test:
	cd apps/web && npm test -- --run

lint:
	cd apps/api && go vet ./...
	cd apps/web && npm run lint

build:
	cd apps/api && go build ./cmd/server
	cd apps/web && npm run build

dev-api:
	cd apps/api && go run ./cmd/server

dev-web:
	cd apps/web && npm run dev
