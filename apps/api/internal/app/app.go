package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/luodaoyi/Certwarden/apps/api/internal/auth"
	"github.com/luodaoyi/Certwarden/apps/api/internal/config"
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

func (a *App) Run(ctx context.Context) error {
	a.scheduler.Start(ctx)

	errCh := make(chan error, 1)
	go func() {
		a.logger.Info("http server listening", "addr", a.cfg.AppAddr)
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
	case err := <-errCh:
		if err != nil {
			return err
		}
	}

	a.scheduler.Stop()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return a.server.Shutdown(shutdownCtx)
}
