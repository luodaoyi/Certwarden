package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"go-check-ssl/apps/api/internal/app"
	"go-check-ssl/apps/api/internal/config"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("load config", "error", err)
		os.Exit(1)
	}

	instance, err := app.New(ctx, cfg, logger)
	if err != nil {
		logger.Error("create app", "error", err)
		os.Exit(1)
	}

	if err := instance.Run(ctx); err != nil {
		logger.Error("run app", "error", err)
		os.Exit(1)
	}
}
