FROM node:24-alpine AS web-builder
WORKDIR /src/apps/web
COPY apps/web/package*.json ./
RUN npm install
COPY apps/web ./
RUN npm run build

FROM golang:1.25-alpine AS api-builder
RUN apk add --no-cache build-base
WORKDIR /src/apps/api
COPY apps/api/go.mod apps/api/go.sum* ./
RUN go mod download
COPY apps/api ./
ENV CGO_ENABLED=1
RUN go build -o /out/go-check-ssl ./cmd/server

FROM alpine:3.21
RUN adduser -D -u 10001 app && \
    apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=api-builder /out/go-check-ssl /app/go-check-ssl
COPY --from=web-builder /src/apps/web/dist /app/web
USER app
EXPOSE 8080
CMD ["/app/go-check-ssl"]
