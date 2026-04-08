FROM --platform=$BUILDPLATFORM node:24-alpine AS web-builder
WORKDIR /src/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web ./
RUN npm run build

FROM golang:1.25-alpine AS api-builder
RUN apk add --no-cache build-base
WORKDIR /src/apps/api
COPY apps/api/go.mod apps/api/go.sum* ./
RUN go mod download
COPY apps/api ./
ENV CGO_ENABLED=1
RUN go build -o /out/certwarden ./cmd/server

FROM alpine:3.21
RUN adduser -D -u 10001 app && \
    apk add --no-cache ca-certificates tzdata && \
    mkdir -p /app /data && \
    chown -R app:app /app /data
WORKDIR /app
COPY --from=api-builder /out/certwarden /app/certwarden
COPY --from=web-builder /src/apps/web/dist /app/web
USER app
EXPOSE 8080
CMD ["/app/certwarden"]
