package testutil

import (
	"context"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"testing"
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

type TestRuntime struct {
	Config     config.Config
	DB         *gorm.DB
	Mailer     *mailer.MemorySender
	Auth       *auth.Service
	Notify     *notify.Service
	Scheduler  *scheduler.Service
	HTTPServer *httpapi.Server
	Logger     *slog.Logger
}

func NewRuntime(t *testing.T) *TestRuntime {
	t.Helper()

	cfg := config.Config{
		AppEnv:                 "test",
		AppAddr:                ":0",
		AppBaseURL:             "http://localhost:8080",
		DBDriver:               "sqlite",
		DatabaseURL:            filepath.Join(t.TempDir(), "test.db"),
		AllowRegistration:      true,
		BootstrapAdminUsername: "admin",
		BootstrapAdminEmail:    "admin@example.com",
		BootstrapAdminPassword: "admin",
		JWTSecret:              "unit-test-secret",
		AccessTokenTTL:         15 * time.Minute,
		RefreshTokenTTL:        24 * time.Hour,
		ScanConcurrency:        1,
		ScanInterval:           time.Hour,
		ScanTimeout:            time.Second,
		WebhookTimeout:         time.Second,
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{}))
	db, err := database.Open(cfg)
	if err != nil {
		if strings.Contains(err.Error(), "requires cgo") {
			t.Skipf("sqlite driver unavailable in this environment: %v", err)
		}
		t.Fatalf("open database: %v", err)
	}
	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := database.EnsureBootstrap(context.Background(), db, cfg, logger); err != nil {
		t.Fatalf("bootstrap database: %v", err)
	}

	sender := &mailer.MemorySender{}
	authService := auth.NewService(db, cfg, sender, logger)
	notifyService := notify.NewService(db, cfg, sender, logger)
	checker := sslcheck.New(cfg.ScanTimeout)
	schedulerService := scheduler.NewService(db, cfg, checker, notifyService, logger)
	server := httpapi.NewServer(cfg, db, authService, notifyService, schedulerService, logger)

	return &TestRuntime{
		Config:     cfg,
		DB:         db,
		Mailer:     sender,
		Auth:       authService,
		Notify:     notifyService,
		Scheduler:  schedulerService,
		HTTPServer: server,
		Logger:     logger,
	}
}
