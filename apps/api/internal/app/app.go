package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/auth"
	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
	"github.com/luodaoyi/Certwarden/apps/api/internal/crashlog"
	"github.com/luodaoyi/Certwarden/apps/api/internal/database"
	"github.com/luodaoyi/Certwarden/apps/api/internal/httpapi"
	"github.com/luodaoyi/Certwarden/apps/api/internal/mailer"
	"github.com/luodaoyi/Certwarden/apps/api/internal/notify"
	"github.com/luodaoyi/Certwarden/apps/api/internal/scheduler"
	"github.com/luodaoyi/Certwarden/apps/api/internal/sslcheck"

	"gorm.io/gorm"
)

type App struct {
	cfg       config.Config
	db        *gorm.DB
	server    *http.Server
	scheduler *scheduler.Service
	logger    *slog.Logger
}

func New(ctx context.Context, cfg config.Config, logger *slog.Logger) (*App, error) {
	db, err := database.Open(cfg)
	if err != nil {
		return nil, err
	}
	if err := database.Migrate(db); err != nil {
		return nil, fmt.Errorf("migrate database: %w", err)
	}
	if err := database.EnsureBootstrap(ctx, db, cfg, logger); err != nil {
		return nil, fmt.Errorf("bootstrap database: %w", err)
	}

	mailSender := mailer.NewSender(cfg.SMTP, logger)
	authService := auth.NewService(db, cfg, mailSender, logger)
	notifyService := notify.NewService(db, cfg, mailSender, logger)
	checker := sslcheck.New(cfg.ScanTimeout)
	schedulerService := scheduler.NewService(db, cfg, checker, notifyService, logger)

	apiServer := httpapi.NewServer(cfg, db, authService, notifyService, schedulerService, logger)
	httpServer := &http.Server{
		Addr:    cfg.AppAddr,
		Handler: apiServer.Router(),
	}

	return &App{
		cfg:       cfg,
		db:        db,
		server:    httpServer,
		scheduler: schedulerService,
		logger:    logger,
	}, nil
}

func (a *App) Run(ctx context.Context) (runErr error) {
	a.scheduler.Start(ctx)

	errCh := make(chan error, 1)
	go func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				crashlog.Log(a.logger, "http server goroutine panicked", recovered, "addr", a.cfg.AppAddr)
				select {
				case errCh <- fmt.Errorf("http server goroutine panic: %v", recovered):
				default:
				}
			}
			close(errCh)
		}()

		a.logger.Info("http server listening", "addr", a.cfg.AppAddr)
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			a.logger.Error("http server exited unexpectedly", "addr", a.cfg.AppAddr, "error", err)
			errCh <- err
			return
		}

		a.logger.Info("http server stopped", "addr", a.cfg.AppAddr)
	}()

	select {
	case <-ctx.Done():
		a.logger.Warn("application context canceled", "error", ctx.Err(), "cause", context.Cause(ctx))
	case err, ok := <-errCh:
		if ok && err != nil {
			runErr = err
			break
		}
		a.logger.Warn("http server stopped without an explicit error", "addr", a.cfg.AppAddr)
	}

	a.logger.Info("stopping scheduler")
	a.scheduler.Stop()
	a.logger.Info("scheduler stopped")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := a.server.Shutdown(shutdownCtx); err != nil && err != http.ErrServerClosed {
		if runErr != nil {
			return fmt.Errorf("%w; shutdown server: %w", runErr, err)
		}
		return err
	}

	a.logger.Info("application shutdown completed")
	return runErr
}
