package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/luodaoyi/Certwarden/apps/api/internal/app"
	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/crashlog"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	defer func() {
		if recovered := recover(); recovered != nil {
			crashlog.Log(logger, "main goroutine panicked", recovered)
			os.Exit(1)
		}
	}()

	ctx, cancel := context.WithCancelCause(context.Background())
	defer cancel(nil)

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)

	go func() {
		select {
		case sig := <-signals:
			logger.Warn("shutdown signal received", "signal", sig.String())
			cancel(fmt.Errorf("received shutdown signal: %s", sig))
		case <-ctx.Done():
		}
	}()

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
